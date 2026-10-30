// What forUser in db.ts does to each query, kept apart so it can be tested without a database.

/** The tables that belong to a user. Better Auth's and LimitCounter don't. */
const USER_MODELS = new Set(["Gig", "SyncRun", "SavedName", "PinnedSpelling", "MatchRule", "CalendarAccount"]);

export function belongsToUser(model: string | undefined): boolean {
  return model !== undefined && USER_MODELS.has(model);
}

type Args = { where?: object; data?: unknown; create?: object; update?: object };

/** Drops any userId, so an update can't hand a row to someone else. */
function withoutUser(data: object): object {
  return Object.fromEntries(Object.entries(data).filter(([field]) => field !== "userId"));
}

/**
 * The query's arguments, limited to this user: every `where` gets their id and every new row is
 * theirs, whatever the caller passed. This covers the top level of a query only. A nested write
 * isn't scoped, so don't use one on these tables. An operation not listed here is refused, so one
 * Prisma adds later can't skip the check.
 */
export function scopeArgs(userId: string, operation: string, args: Args = {}): Args {
  switch (operation) {
    case "findMany":
    case "findFirst":
    case "findFirstOrThrow":
    case "findUnique":
    case "findUniqueOrThrow":
    case "count":
    case "aggregate":
    case "groupBy":
    case "delete":
    case "deleteMany":
      return { ...args, where: { ...args.where, userId } };
    case "update":
    case "updateMany":
    case "updateManyAndReturn":
      return { ...args, where: { ...args.where, userId }, data: withoutUser(args.data as object) };
    case "create":
      return { ...args, data: { ...(args.data as object), userId } };
    case "createMany":
    case "createManyAndReturn": {
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      return { ...args, data: rows.map((row: object) => ({ ...row, userId })) };
    }
    case "upsert":
      return {
        ...args,
        where: { ...args.where, userId },
        create: { ...args.create, userId },
        update: withoutUser(args.update ?? {}),
      };
    default:
      throw new Error(`forUser doesn't know how to limit ${operation} to one user`);
  }
}
