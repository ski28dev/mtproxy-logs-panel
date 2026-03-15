import fs from 'fs/promises';
import path from 'path';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

const handshakePattern =
  /^\[(?<pid>\d+)]\[(?<time>[^\]]+) local] MTP_EVENT handshake_ok secret_id=(?<slot>\d+) fd=(?<fd>\d+) ip=(?<ip>[^ ]+) port=(?<port>\d+) domain=(?<domain>\S+)/;

const disconnectPattern =
  /^\[(?<pid>\d+)]\[(?<time>[^\]]+) local] MTP_EVENT disconnect secret_id=(?<slot>\d+) fd=(?<fd>\d+) ip=(?<ip>[^ ]+) port=(?<port>\d+) duration=(?<duration>[0-9.]+) who=(?<who>-?\d+)/;

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

function normalizeTimestamp(value) {
  return value.replace(' local', '').trim();
}

async function readState() {
  try {
    const raw = await fs.readFile(env.mtproxy.logStatePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { offset: 0 };
  }
}

async function writeState(state) {
  await fs.mkdir(path.dirname(env.mtproxy.logStatePath), { recursive: true });
  await fs.writeFile(env.mtproxy.logStatePath, JSON.stringify(state), { mode: 0o600 });
}

async function resolveSecretId(slotIndex, connectedAt) {
  const [rows] = await pool.query(
    `
      SELECT proxy_secret_id
      FROM proxy_secret_runtime_history
      WHERE slot_index = ?
        AND applied_at <= ?
        AND (removed_at IS NULL OR removed_at >= ?)
      ORDER BY applied_at DESC
      LIMIT 1
    `,
    [slotIndex, connectedAt, connectedAt]
  );

  return rows[0]?.proxy_secret_id || null;
}

function parseLine(line) {
  const handshake = line.match(handshakePattern);
  if (handshake) {
    return {
      eventType: 'handshake_ok',
      slotIndex: Number.parseInt(handshake.groups.slot, 10),
      connectionFd: Number.parseInt(handshake.groups.fd, 10),
      clientIp: handshake.groups.ip,
      remotePort: Number.parseInt(handshake.groups.port, 10),
      connectedAt: normalizeTimestamp(handshake.groups.time),
      durationSeconds: null,
      sourceLine: line
    };
  }

  const disconnect = line.match(disconnectPattern);
  if (disconnect) {
    return {
      eventType: 'disconnect',
      slotIndex: Number.parseInt(disconnect.groups.slot, 10),
      connectionFd: Number.parseInt(disconnect.groups.fd, 10),
      clientIp: disconnect.groups.ip,
      remotePort: Number.parseInt(disconnect.groups.port, 10),
      connectedAt: normalizeTimestamp(disconnect.groups.time),
      durationSeconds: Number.parseFloat(disconnect.groups.duration),
      sourceLine: line
    };
  }

  return null;
}

async function importLog() {
  const state = await readState();
  const handle = await fs.open(env.mtproxy.logPath, 'r');
  const stats = await handle.stat();

  if (state.offset > stats.size) {
    state.offset = 0;
  }

  const length = stats.size - state.offset;
  if (length <= 0) {
    await handle.close();
    return;
  }

  const buffer = Buffer.alloc(length);
  await handle.read(buffer, 0, length, state.offset);
  await handle.close();

  const chunk = buffer.toString('utf8');
  const lines = chunk.split('\n');
  let inserted = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const event = parseLine(line);
    if (!event) {
      continue;
    }

    const proxySecretId = await resolveSecretId(event.slotIndex, event.connectedAt);
    if (!proxySecretId) {
      continue;
    }

    await pool.query(
      `
        INSERT INTO proxy_secret_events (
          proxy_secret_id,
          event_type,
          slot_index,
          connection_fd,
          client_ip,
          remote_port,
          connected_at,
          duration_seconds,
          source_line
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        proxySecretId,
        event.eventType,
        event.slotIndex,
        event.connectionFd,
        event.clientIp,
        event.remotePort,
        event.connectedAt,
        event.durationSeconds,
        event.sourceLine
      ]
    );

    inserted += 1;
  }

  await writeState({ offset: stats.size });
  await setMeta('last_log_import_at', new Date().toISOString());
  console.log(`Imported ${inserted} mtproxy events`);
}

importLog()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
