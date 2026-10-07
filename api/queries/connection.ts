import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import type { Pool } from "mysql2/promise";
import { env } from "../lib/env";
import * as schema from "../../db/schema";
let pool: Pool | undefined;
let instance: MySql2Database<typeof schema> | undefined;
export function getDb(): MySql2Database<typeof schema> {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not configured");
  if (!pool) {
    const rawPool = mysql.createPool({
      uri: env.databaseUrl,
      connectionLimit: 10,
      enableKeepAlive: true,
      timezone: "Z",
    });
    // Drizzle encodes TIMESTAMP values as UTC strings. Set the server session
    // before its first queued query, including on replacement connections.
    rawPool.on("connection", connection => {
      connection.query("SET SESSION time_zone = '+00:00'", error => {
        if (error) connection.destroy();
      });
    });
    pool = rawPool.promise();
  }
  instance ??= drizzle(pool, { mode: "default", schema });
  return instance;
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
  instance = undefined;
}
