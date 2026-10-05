import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../lib/env";
import * as schema from "../../db/schema";
let pool: ReturnType<typeof mysql.createPool> | undefined;
let instance: MySql2Database<typeof schema> | undefined;
export function getDb(): MySql2Database<typeof schema> {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not configured");
  pool ??= mysql.createPool({
    uri: env.databaseUrl,
    connectionLimit: 10,
    enableKeepAlive: true,
  });
  instance ??= drizzle(pool, { mode: "default", schema });
  return instance;
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
  instance = undefined;
}
