import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureAdminSeeded } from './services/auth.service.js';

async function start() {
  await ensureAdminSeeded();
  const app = createApp();

  app.listen(env.port, env.host, () => {
    console.log(`mtproxy-panel api listening on http://${env.host}:${env.port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
