import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { db } from "./db";
import { linkEmail, sendEmail } from "./email";
import { authBaseURL, authSecret, COOKIE_PREFIX, LINK_LIFETIME, trustedOrigins } from "./login";
import { ownerPassword } from "./owner-login";

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
  user: {
    additionalFields: { isOwner: { type: "boolean", required: false, defaultValue: false, input: false } },
    // Only used by the owner adding his first real email (see Settings → Account).
    changeEmail: { enabled: true },
  },
  emailVerification: {
    expiresIn: LINK_LIFETIME,
    sendVerificationEmail: async ({ user, url, token }) => {
      await sendEmail(
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
  ],
  plugins: [
    magicLink({
      expiresIn: LINK_LIFETIME,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url, token }) => {
        await sendEmail(
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
    // Last, so cookies set by auth.api calls in server actions reach the browser.
    nextCookies(),
  ],
});

export type SessionUser = typeof auth.$Infer.Session.user;
