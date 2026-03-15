import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { unauthorized } from '../utils/errors.js';

export async function ensureAdminSeeded() {
  const [rows] = await pool.query('SELECT id FROM admins LIMIT 1');
  if (rows.length > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash(env.admin.password, 10);
  await pool.query(
    'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
    [env.admin.username, passwordHash]
  );
}

export async function loginAdmin(username, password) {
  const [rows] = await pool.query(
    'SELECT id, username, password_hash FROM admins WHERE username = ? LIMIT 1',
    [username]
  );
  const admin = rows[0];

  if (!admin) {
    throw unauthorized('Invalid credentials');
  }

  const matches = await bcrypt.compare(password, admin.password_hash);
  if (!matches) {
    throw unauthorized('Invalid credentials');
  }

  const token = jwt.sign(
    {
      sub: admin.id,
      username: admin.username
    },
    env.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    token,
    admin: {
      id: admin.id,
      username: admin.username
    }
  };
}

export async function findAdminById(adminId) {
  const [rows] = await pool.query(
    'SELECT id, username, created_at FROM admins WHERE id = ? LIMIT 1',
    [adminId]
  );
  return rows[0] || null;
}
