import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function applied() {
  const { rows } = await pool.query("SELECT filename FROM _migrations ORDER BY id ASC;");
  return new Set(rows.map((r) => r.filename));
}

async function up() {
  await ensureTable();
  const done = await applied();
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    console.log(`Applying migration: ${f}`);
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO _migrations (filename) VALUES ($1);", [f]);
      await pool.query("COMMIT");
      console.log(`✔ Applied ${f}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      console.error(`❌ Failed migration ${f}:`, err.message);
      process.exit(1);
    }
  }

  console.log("✅ Migrations up to date.");
  await pool.end();
}

async function down() {
  console.log("Down migrations not implemented yet.");
  await pool.end();
}

const cmd = process.argv[2] || "up";
if (cmd === "up") await up();
else if (cmd === "down") await down();
else {
  console.log("Usage: node src/db/migrate.js [up|down]");
  process.exit(1);
}
