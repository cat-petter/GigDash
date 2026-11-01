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

/** A query on its own waits for a free connection when a page runs many at once, as the owner's list of users does. */
const QUERY_TRANSACTION = { maxWait: 10_000, timeout: 10_000 };

/**
 * The database as one user sees it: a query on their tables can only reach their rows, even if it
 * forgets to filter or names someone else's id. Lint refuses those tables on plain `db`.
 *
 * There are two layers. The extension adds the user to every query, and each query or $transaction
 * runs in a transaction as gigdash_user, where row-level security (migration 6) holds even for a
 * nested write or raw SQL. That's why a query here starts straight away and is a plain promise, so it
 * can't go in the array form of $transaction, which is refused.
 */
export function forUser(userId: string) {
  const scoped = db.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(belongsToUser(model) ? scopeArgs(userId, operation, args) : args);
        },
      },
    },
  });
  type Work = Parameters<typeof scoped.$transaction>[0];

  function asUser(work: Work, options?: object) {
    if (typeof work !== "function") throw new Error("forUser only takes the function form of $transaction");
    return scoped.$transaction(async (tx) => {
      // Both are undone when the transaction ends, so a pooled connection goes back as it was.
      await tx.$executeRaw`SELECT set_config('role', 'gigdash_user', true), set_config('app.user_id', ${userId}, true)`;
      return work(tx);
    }, { ...QUERY_TRANSACTION, ...options });
  }

  return new Proxy(scoped, {
    get(target, property) {
      if (property === "$transaction") return asUser;
      const delegate: unknown = Reflect.get(target, property);
      if (typeof property !== "string" || property.startsWith("$") || typeof delegate !== "object" || delegate === null) {
        return delegate;
      }
      return new Proxy(delegate, {
        get: (_, operation: string) =>
          (...args: unknown[]) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the outer type already checked these
            asUser((tx: any) => tx[property][operation](...args)),
      });
    },
  });
}
