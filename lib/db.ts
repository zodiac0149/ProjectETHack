import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;

export function getPool() {
  return pool;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function ensureSchema() {
  if (!hasDatabase()) return;
  try {
    // Simple check/create for agent_logs table
    await query(`
      CREATE TABLE IF NOT EXISTS agent_logs (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        user_id TEXT,
        feature TEXT NOT NULL,
        action TEXT NOT NULL,
        model TEXT,
        input_json JSONB,
        output_json JSONB,
        meta_json JSONB,
        duration_ms INTEGER,
        ok BOOLEAN DEFAULT TRUE,
        error_text TEXT
      );
    `);
  } catch (e) {
    // Silently skip if DB is unavailable
  }
}

export async function query<T = any>(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log("executed query", { text, duration, rows: res.rowCount });
  return res;
}
