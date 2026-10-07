import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  socketPath: process.env.DATABASE_SOCKET || undefined,
  connectionLimit: 1,
  timezone: "Z",
});
try {
  const connection = await pool.getConnection();
  try {
    await connection.query("SET SESSION time_zone = '+00:00'");
    await migrate(drizzle(connection), { migrationsFolder: "./db/migrations" });
  } finally {
    connection.release();
  }
  console.log("Migrations applied");
} finally {
  await pool.end();
}
