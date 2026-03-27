import { ensureSchema, getPool, hasDatabase } from "@/lib/db";

export type AgentLogRow = {
  id: number;
  created_at: string;
  user_id: string | null;
  feature: string;
  action: string;
  model: string | null;
  input_json: unknown | null;
  output_json: unknown | null;
  meta_json: unknown | null;
  duration_ms: number | null;
  ok: boolean;
  error_text: string | null;
};

export async function logAgentEvent(args: {
  userId?: string | null;
  feature: string;
  action: string;
  model?: string | null;
  input?: unknown;
  output?: unknown;
  meta?: unknown;
  durationMs?: number | null;
  ok?: boolean;
  errorText?: string | null;
}): Promise<void> {
  if (!hasDatabase()) return;
  try {
    await ensureSchema();
    const pool = getPool();
    await pool.query(
      `
      INSERT INTO agent_logs
        (user_id, feature, action, model, input_json, output_json, meta_json, duration_ms, ok, error_text)
      VALUES
        ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10)
    `,
      [
        args.userId ?? null,
        args.feature,
        args.action,
        args.model ?? null,
        args.input === undefined ? null : JSON.stringify(args.input),
        args.output === undefined ? null : JSON.stringify(args.output),
        args.meta === undefined ? null : JSON.stringify(args.meta),
        args.durationMs ?? null,
        args.ok ?? true,
        args.errorText ?? null,
      ]
    );
  } catch (e) {
    // Silently skip if DB is unavailable
  }
}

export async function listAgentLogs(limit = 200): Promise<AgentLogRow[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows as AgentLogRow[];
}

