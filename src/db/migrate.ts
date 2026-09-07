/**
 * Applies the database schema (`schema.sql`) to the configured Postgres
 * database. The schema is written to be idempotent (CREATE TABLE IF NOT EXISTS
 * and conditional ALTER TABLE ... ADD COLUMN), so re-running is safe.
 *
 * Usage: npm run db:migrate
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { pool } from "./client.js";
import { logger } from "../logger.js";

async function migrate(): Promise<void> {
  const schemaPath = process.env.SCHEMA_PATH || resolve(process.cwd(), "src/db/schema.sql");
  const sql = readFileSync(schemaPath, "utf-8");
  await pool.query(sql);
  logger.info(`Schema applied from ${schemaPath}`);
}

migrate()
  .then(() => pool.end())
  .catch(async (err) => {
    logger.error({ err }, "Migration failed");
    await pool.end();
    process.exit(1);
  });
