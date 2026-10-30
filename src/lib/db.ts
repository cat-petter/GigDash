import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { belongsToUser, scopeArgs } from "./user-scope";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// Reuse one client across hot reloads in development.
export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * The database as one user sees it: a query on their tables can only reach their rows, even if it
 * forgets to filter or names someone else's id. Lint refuses those tables on plain `db`.
 */
export function forUser(userId: string) {
  return db.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(belongsToUser(model) ? scopeArgs(userId, operation, args) : args);
        },
      },
    },
  });
}
