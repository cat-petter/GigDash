import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Read directly (not with env()) so `prisma generate` works without a database URL.
    // Migrations take the direct connection when there is one: Neon's DATABASE_URL goes
    // through a connection pooler, which migrations shouldn't use.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
  },
});
