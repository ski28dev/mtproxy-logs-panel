import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

const execFileAsync = promisify(execFile);

async function commandOk(command, args) {
  try {
    await execFileAsync(command, args, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function hasListeningPort(port) {
  try {
    const { stdout } = await execFileAsync('ss', ['-lnt'], { timeout: 3000 });
    const portPattern = new RegExp(`:${port}\\s`);
    return stdout
      .split('\n')
      .some((line) => line.includes('LISTEN') && portPattern.test(line));
  } catch {
    return false;
  }
}

async function getLastAutoRestartAt() {
  try {
    const content = await readFile('/var/log/mtproxy/watchdog.log', 'utf8');
    const lines = content.trim().split('\n').reverse();
    for (const line of lines) {
      if (!line.includes('restart successful')) {
        continue;
      }
      const match = line.match(/^\[(.+?)\]/);
      if (match?.[1]) {
        return match[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getMtproxyHealth() {
  const [serviceActive, watchdogActive, portListening, lastAutoRestartAt, eventRows] = await Promise.all([
    commandOk('systemctl', ['is-active', '--quiet', 'mtproxy']),
    commandOk('systemctl', ['is-active', '--quiet', 'mtproxy-watchdog.timer']),
    hasListeningPort(env.mtproxy.port),
    getLastAutoRestartAt(),
    pool.query(
      `
        SELECT connected_at, proxy_secret_id, client_ip
        FROM proxy_secret_events
        WHERE event_type = 'handshake_ok'
        ORDER BY connected_at DESC
        LIMIT 1
      `
    )
  ]);

  const [rows] = eventRows;
  const lastHandshake = rows[0] || null;

  return {
    online: serviceActive && portListening,
    serviceActive,
    portListening,
    watchdogActive,
    lastAutoRestartAt,
    lastHandshakeAt: lastHandshake?.connected_at || null,
    lastHandshakeSecretId: lastHandshake?.proxy_secret_id || null,
    lastHandshakeIp: lastHandshake?.client_ip || null
  };
}
