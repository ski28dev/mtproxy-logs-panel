import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import routes from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { env } from './config/env.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.panelOrigin ? [env.panelOrigin] : true,
      credentials: false
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', routes);
  app.use(errorHandler);

  return app;
}
