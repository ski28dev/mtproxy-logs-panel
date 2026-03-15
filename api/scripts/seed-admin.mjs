import bcrypt from 'bcryptjs';
import { pool } from '../src/db/pool.js';
import { env } from '../src/config/env.js';

const passwordHash = await bcrypt.hash(env.admin.password, 10);

await pool.query(
  `
    INSERT INTO admins (username, password_hash)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
  `,
  [env.admin.username, passwordHash]
);

console.log(`Admin ${env.admin.username} is ready`);
await pool.end();
