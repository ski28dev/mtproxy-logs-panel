import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { findAdminById, loginAdmin } from '../services/auth.service.js';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      username: z.string().min(1),
      password: z.string().min(1)
    });

    const payload = schema.parse(req.body);
    const result = await loginAdmin(payload.username, payload.password);

    res.json({
      ok: true,
      ...result
    });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const admin = await findAdminById(req.auth.sub);
    res.json({
      ok: true,
      admin
    });
  })
);

export default router;
