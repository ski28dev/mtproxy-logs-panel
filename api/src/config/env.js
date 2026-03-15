import dotenv from 'dotenv';

dotenv.config();

function getRequired(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return value;
}

export const env = {
  host: process.env.HOST || '127.0.0.1',
  port: getInt('PORT', 3210),
  db: {
    host: getRequired('DB_HOST'),
    port: getInt('DB_PORT', 3306),
    name: getRequired('DB_NAME'),
    user: getRequired('DB_USER'),
    password: getRequired('DB_PASSWORD')
  },
  jwtSecret: getRequired('JWT_SECRET'),
  admin: {
    username: getRequired('ADMIN_USERNAME'),
    password: getRequired('ADMIN_PASSWORD')
  },
  panelOrigin: process.env.PANEL_ORIGIN || '',
  mtproxy: {
    host: getRequired('MTPROXY_HOST'),
    port: getInt('MTPROXY_PORT', 443),
    fakeHost: getRequired('MTPROXY_FAKE_HOST'),
    syncCommand: process.env.MTPROXY_SYNC_COMMAND || '',
    logPath: process.env.MTPROXY_LOG_PATH || '/var/log/mtproxy/mtproxy.log',
    logStatePath: process.env.MTPROXY_LOG_STATE_PATH || '/var/lib/mtproxy-panel/log-state.json',
    slotWindowHours: getInt('MTPROXY_SLOT_WINDOW_HOURS', 72)
  }
};
