import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

const schema = await fs.readFile(schemaPath, 'utf8');

for (const statement of schema.split(/;\s*$/m)) {
  const sql = statement.trim();
  if (!sql) {
    continue;
  }
  await pool.query(sql);
}

console.log('Database schema is ready');
await pool.end();
