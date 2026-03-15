import { exec } from 'child_process';
import { promisify } from 'util';
import { env } from '../config/env.js';

const execAsync = promisify(exec);

export async function runSyncCommand() {
  if (!env.mtproxy.syncCommand) {
    return { ok: false, skipped: true, message: 'Sync command is not configured' };
  }

  try {
    const { stdout, stderr } = await execAsync(env.mtproxy.syncCommand, {
      timeout: 30_000,
      maxBuffer: 1024 * 1024
    });

    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message
    };
  }
}
