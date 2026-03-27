import pool from "../lib/db";

async function setup() {
  console.log("Setting up PostgreSQL schema...");
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Atoms table
    await client.query(`
      CREATE TABLE IF NOT EXISTS atoms (
        atom_id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        article_title TEXT,
        idx INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        tags JSONB,
        sector_hint TEXT,
        entity_hint TEXT
      );
    `);

    // Conflicts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conflicts (
        conflict_id TEXT PRIMARY KEY,
        a_atom_id TEXT REFERENCES atoms(atom_id) ON DELETE CASCADE,
        b_atom_id TEXT REFERENCES atoms(atom_id) ON DELETE CASCADE,
        url_a TEXT,
        url_b TEXT,
        reason TEXT,
        kind TEXT
      );
    `);

    // Social Posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_posts (
        post_id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        content TEXT NOT NULL,
        source_atom_ids TEXT[],
        verification JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Agent Logs table
    await client.query(`
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
    await client.query("COMMIT");
    console.log("Schema setup complete.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Schema setup failed:", e);
  } finally {
    client.release();
    process.exit(0);
  }
}

setup();
