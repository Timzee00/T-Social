import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 1,
});
try {
  await migrate(drizzle(pool), { migrationsFolder: "./db/migrations" });
  console.log("Migrations applied");
} finally {
  await pool.end();
}
