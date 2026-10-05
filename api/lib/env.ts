import "dotenv/config";
const isProduction = process.env.NODE_ENV === "production";
const publicUrl = process.env.PUBLIC_APP_URL || "http://localhost:3000";
const parsed = new URL(publicUrl);
const origin = parsed.origin;
if (
  !["https:", "http:"].includes(parsed.protocol) ||
  parsed.pathname !== "/" ||
  parsed.search ||
  parsed.hash ||
  parsed.username ||
  parsed.password ||
  (isProduction && parsed.protocol !== "https:")
)
  throw new Error(
    "PUBLIC_APP_URL must be an origin, using HTTPS in production"
  );
if (
  isProduction &&
  (!process.env.DATABASE_URL || (process.env.SESSION_SECRET?.length ?? 0) < 32)
)
  throw new Error(
    "DATABASE_URL and SESSION_SECRET (32+ characters) are required"
  );
if (
  isProduction &&
  process.env.S3_ENDPOINT &&
  new URL(process.env.S3_ENDPOINT).protocol !== "https:"
)
  throw new Error("S3_ENDPOINT must use HTTPS in production");
export const env = {
  isProduction,
  publicUrl: origin,
  databaseUrl: process.env.DATABASE_URL || "",
  sessionSecret:
    process.env.SESSION_SECRET || "development-only-not-for-production",
};
