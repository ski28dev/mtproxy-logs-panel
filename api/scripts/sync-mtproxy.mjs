import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { promisify } from 'util';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

const execFileAsync = promisify(execFile);

const managedListPath = '/etc/mtproxy/managed_secrets.list';
const checksumPath = '/etc/mtproxy/managed_secrets.sha256';

async function setMeta(key, value) {
  await pool.query(
    `
      INSERT INTO app_meta (meta_key, meta_value)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)
    `,
    [key, value]
  );
}

async function sync() {
  const [rows] = await pool.query(
    `
      SELECT id, raw_secret
      FROM proxy_secrets
      WHERE status = 'active'
      ORDER BY id ASC
    `
  );

  const lines = rows.map((row) => row.raw_secret);
  const content = lines.join('\n') + (lines.length ? '\n' : '');
  const hash = createHash('sha256').update(content, 'utf8').digest('hex');

  let oldHash = '';
  try {
    oldHash = (await fs.readFile(checksumPath, 'utf8')).trim();
  } catch {}

  await fs.mkdir(path.dirname(managedListPath), { recursive: true });
  await fs.writeFile(managedListPath, content, { mode: 0o600 });
  await fs.writeFile(checksumPath, `${hash}\n`, { mode: 0o600 });

  await pool.query('UPDATE proxy_secrets SET current_slot = NULL');

  for (const [index, row] of rows.entries()) {
    await pool.query(
      `
        UPDATE proxy_secrets
        SET current_slot = ?
        WHERE id = ?
      `,
      [index, row.id]
    );

    const [activeHistory] = await pool.query(
      `
        SELECT id, slot_index
        FROM proxy_secret_runtime_history
        WHERE proxy_secret_id = ? AND removed_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `,
      [row.id]
    );

    const currentHistory = activeHistory[0];
    if (!currentHistory || currentHistory.slot_index !== index) {
      if (currentHistory) {
        await pool.query(
          'UPDATE proxy_secret_runtime_history SET removed_at = UTC_TIMESTAMP() WHERE id = ?',
          [currentHistory.id]
        );
      }

      await pool.query(
        `
          INSERT INTO proxy_secret_runtime_history (proxy_secret_id, slot_index)
          VALUES (?, ?)
        `,
        [row.id, index]
      );
    }
  }

  await pool.query(
    `
      UPDATE proxy_secret_runtime_history
      SET removed_at = UTC_TIMESTAMP()
      WHERE removed_at IS NULL
        AND proxy_secret_id NOT IN (
          SELECT id FROM proxy_secrets WHERE status = 'active'
        )
    `
  );

  if (hash !== oldHash) {
    await execFileAsync('systemctl', ['restart', 'mtproxy.service']);
  }

  await setMeta('last_mtproxy_sync_at', new Date().toISOString());
  console.log(`Synced ${rows.length} active secrets${hash !== oldHash ? ' with restart' : ''}`);
}

sync()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
