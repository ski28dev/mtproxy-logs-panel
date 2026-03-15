import { Router } from 'express';
import authRoutes from './auth.routes.js';
import secretsRoutes from './secrets.routes.js';
import systemRoutes from './system.routes.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.use('/auth', authRoutes);
router.use('/secrets', requireAuth, secretsRoutes);
router.use('/system', requireAuth, systemRoutes);

export default router;
