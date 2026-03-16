import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';
import {
  activateSecret,
  createSecret,
  deleteSecret,
  getSecretStats,
  listSecretEvents,
  listSecretUniqueIps,
  listSecrets,
  revokeSecret,
  rotateSecret,
  updateSecretMeta
} from '../services/secrets.service.js';
import { runSyncCommand } from '../services/sync-runner.js';
import { env } from '../config/env.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const windowHours = Number.parseInt(req.query.windowHours, 10) || env.mtproxy.slotWindowHours;
    const secrets = await listSecrets(windowHours);
    res.json({ ok: true, secrets });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      label: z.string().min(1),
      groupName: z.string().max(255).optional().default(''),
      note: z.string().optional().default(''),
      maxUniqueIps: z.number().int().min(1).max(1000).default(10)
    });

    const input = schema.parse(req.body);
    const secret = await createSecret(input);
    const sync = await runSyncCommand();

    res.status(201).json({
      ok: true,
      secret,
      sync
    });
  })
);

router.patch(
  '/:id/meta',
  asyncHandler(async (req, res) => {
    const secretId = Number.parseInt(req.params.id, 10);
    const schema = z.object({
      label: z.string().min(1).max(255).optional(),
      groupName: z.string().max(255).optional().default(''),
      note: z.string().optional().default(''),
      maxUniqueIps: z.number().int().min(1).max(1000).optional()
    });

    const input = schema.parse(req.body);
    const secret = await updateSecretMeta(secretId, input);
    res.json({ ok: true, secret });
  })
);

router.get(
  '/:id/stats',
  asyncHandler(async (req, res) => {
    const secretId = Number.parseInt(req.params.id, 10);
    const stats = await getSecretStats(secretId);
    res.json({ ok: true, stats });
  })
);

router.get(
  '/:id/events',
  asyncHandler(async (req, res) => {
    const secretId = Number.parseInt(req.params.id, 10);
    const limit = Number.parseInt(req.query.limit, 10) || 100;
    const events = await listSecretEvents(secretId, limit);
    res.json({ ok: true, events });
  })
);

router.get(
  '/:id/unique-ips',
  asyncHandler(async (req, res) => {
    const secretId = Number.parseInt(req.params.id, 10);
    const limit = Number.parseInt(req.query.limit, 10) || 200;
    const uniqueIps = await listSecretUniqueIps(secretId, limit);
    res.json({ ok: true, uniqueIps });
  })
);

router.post(
  '/:id/revoke',
  asyncHandler(async (req, res) => {
    const secretId = Number.parseInt(req.params.id, 10);
    const secret = await revokeSecret(secretId);
    const sync = await runSyncCommand();
    res.json({ ok: true, secret, sync });
  })
);

router.post(
  '/:id/activate',
  asyncHandler(async (req, res) => {
    const secretId = Number.parseInt(req.params.id, 10);
    const secret = await activateSecret(secretId);
    const sync = await runSyncCommand();
    res.json({ ok: true, secret, sync });
  })
);

router.post(
  '/:id/rotate',
  asyncHandler(async (req, res) => {
    const secretId = Number.parseInt(req.params.id, 10);
    const secret = await rotateSecret(secretId);
    const sync = await runSyncCommand();
    res.json({ ok: true, secret, sync });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const secretId = Number.parseInt(req.params.id, 10);
    const secret = await deleteSecret(secretId);
    const sync = await runSyncCommand();
    res.json({ ok: true, secret, sync });
  })
);

export default router;
