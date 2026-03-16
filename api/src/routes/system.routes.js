import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { env } from '../config/env.js';
import { getDashboardSummary } from '../services/secrets.service.js';
import { getMtproxyHealth } from '../services/mtproxy-health.service.js';
import { runSyncCommand } from '../services/sync-runner.js';

const router = Router();

router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const [summary, health] = await Promise.all([
      getDashboardSummary(env.mtproxy.slotWindowHours),
      getMtproxyHealth()
    ]);
    res.json({
      ok: true,
      summary,
      health,
      mtproxy: {
        host: env.mtproxy.host,
        port: env.mtproxy.port,
        fakeHost: env.mtproxy.fakeHost,
        windowHours: env.mtproxy.slotWindowHours
      }
    });
  })
);

router.post(
  '/sync',
  asyncHandler(async (_req, res) => {
    const sync = await runSyncCommand();
    res.json({ ok: true, sync });
  })
);

export default router;
