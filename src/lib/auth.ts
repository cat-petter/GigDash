import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getIP } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { captcha } from "better-auth/plugins/captcha";
import { magicLink } from "better-auth/plugins/magic-link";
import { hitCounter } from "./counters";
import { db } from "./db";
import { type Email, linkEmail, sendEmail } from "./email";
import { DAILY_CAP_CODE, LINK_LIMIT_CODE } from "./limit-codes";
import { DAILY_CAP_MESSAGE, linkLimitProblem, spendDailyEmail } from "./limits";
import { authBaseURL, authSecret, COOKIE_PREFIX, LINK_LIFETIME, trustedOrigins, usesTurnstile } from "./login";
import { ownerPassword } from "./owner-login";

const MAGIC_LINK_PATH = "/sign-in/magic-link";

/** The page an emailed link opens: a button, so a mail scanner opening the link doesn't use it up. */
function confirmURL(betterAuthURL: string, token: string, type: "sign-in" | "email"): string {
  const link = new URL(betterAuthURL);
  const confirm = new URL("/login/confirm", link.origin);
  confirm.searchParams.set("token", token);
  if (type === "email") confirm.searchParams.set("type", "email");
  const next = link.searchParams.get("callbackURL");
  if (type === "sign-in" && next && next !== "/") confirm.searchParams.set("next", next);
  return confirm.toString();
}

/** Sends unless today's cap is used up. Every email the app sends comes through here. */
async function sendWithinCap(email: Email): Promise<void> {
  if (!(await spendDailyEmail(hitCounter))) {
    throw new APIError("SERVICE_UNAVAILABLE", { message: DAILY_CAP_MESSAGE, code: DAILY_CAP_CODE });
  }
  await sendEmail(email);
}

const DAY = 24 * 60 * 60;

export const auth = betterAuth({
  appName: "Gigs",
  baseURL: authBaseURL(),
  secret: authSecret(),
  trustedOrigins: trustedOrigins(),
  database: prismaAdapter(db, { provider: "postgresql" }),
  telemetry: { enabled: false },
  advanced: { cookiePrefix: COOKIE_PREFIX },
  session: { expiresIn: 90 * DAY, updateAge: DAY },
  rateLimit: { enabled: true, storage: "database" },
  hooks: {
    // Runs after the bot check, which is a plugin's onRequest. A request that fails it counts for nothing.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== MAGIC_LINK_PATH || typeof ctx.body?.email !== "string") return;
      const ip = ctx.headers ? getIP(ctx.headers, ctx.context.options) : null;
      const problem = await linkLimitProblem(ctx.body.email, ip, ctx.context.secret, hitCounter);
      if (problem) throw new APIError("TOO_MANY_REQUESTS", { message: problem, code: LINK_LIMIT_CODE });
    }),
  },
  user: {
    additionalFields: { isOwner: { type: "boolean", required: false, defaultValue: false, input: false } },
    // Only used by the owner adding his first real email (see Settings → Account).
    changeEmail: { enabled: true },
  },
  emailVerification: {
    expiresIn: LINK_LIFETIME,
    sendVerificationEmail: async ({ user, url, token }) => {
      await sendWithinCap(
        linkEmail(
          user.email,
          "Confirm your email for Gigs",
          ["Tap the button to confirm this is your email. After that, you'll sign in with a link sent here."],
          "Confirm email",
          confirmURL(url, token, "email"),
        ),
      );
    },
  },
  // Endpoints this app doesn't use. Server code can still call them through auth.api.
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/email",
    "/sign-in/social",
    "/update-user",
    "/change-email",
    "/change-password",
    "/set-password",
    "/delete-user",
    "/send-verification-email",
    "/request-password-reset",
    "/reset-password",
    "/link-social",
    "/unlink-account",
    "/list-accounts",
    // Settings → Account lists and ends sessions from the server. These would hand out session tokens.
    "/list-sessions",
    "/revoke-session",
    "/revoke-sessions",
    "/revoke-other-sessions",
  ],
  plugins: [
    magicLink({
      expiresIn: LINK_LIFETIME,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url, token }) => {
        await sendWithinCap(
          linkEmail(
            email,
            "Sign in to Gigs",
            ["Tap the button to sign in to Gigs. The link works once, for 15 minutes."],
            "Sign in",
            confirmURL(url, token, "sign-in"),
          ),
        );
      },
    }),
    ownerPassword(),
    // An empty key makes every request fail, so a deployment missing it can't send links unchecked.
    ...(usesTurnstile()
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
            endpoints: [MAGIC_LINK_PATH],
          }),
        ]
      : []),
    // Last, so cookies set by auth.api calls in server actions reach the browser.
    nextCookies(),
  ],
});

export type SessionUser = typeof auth.$Infer.Session.user;
