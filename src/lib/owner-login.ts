import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";
import { checkOwnerPassword } from "./login";
import { OWNER_ID, OWNER_PLACEHOLDER_EMAIL } from "./owner";

/** A pause after a wrong password, so guessing is slow. */
const WRONG_PASSWORD_DELAY_MS = 1000;

/**
 * POST /api/auth/sign-in/owner { password }: logs in as the owner with DASHBOARD_PASSWORD, the way
 * the app worked before accounts. It stops working once the owner has added his own email.
 */
export const ownerPassword = () =>
  ({
    id: "owner-password",
    endpoints: {
      signInOwner: createAuthEndpoint(
        "/sign-in/owner",
        { method: "POST", body: z.object({ password: z.string().max(200) }) },
        async (ctx) => {
          const owner = await ctx.context.internalAdapter.findUserById(OWNER_ID);
          if (!owner || owner.email !== OWNER_PLACEHOLDER_EMAIL || !checkOwnerPassword(ctx.body.password)) {
            await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
            throw APIError.fromStatus("UNAUTHORIZED", { message: "That password didn't work." });
          }
          const session = await ctx.context.internalAdapter.createSession(owner.id);
          await setSessionCookie(ctx, { session, user: owner });
          return ctx.json({ ok: true });
        },
      ),
    },
    rateLimit: [{ pathMatcher: (path) => path === "/sign-in/owner", window: 60, max: 5 }],
  }) satisfies BetterAuthPlugin;
