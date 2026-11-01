import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Never .env, which can hold real credentials. .env.local or the shell says which database to use.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.dbtest.ts"],
    // A made-up key, so nothing here can read a real saved password.
    env: { CREDENTIALS_KEY: Buffer.alloc(32, 7).toString("base64"), BETTER_AUTH_SECRET: "isolation-tests" },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
