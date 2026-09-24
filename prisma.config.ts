import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Read directly (not with env()) so `prisma generate` works without a database URL.
    url: process.env.DATABASE_URL ?? "",
  },
});
