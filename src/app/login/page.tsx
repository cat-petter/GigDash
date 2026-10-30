import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { authProblem, safeNext, turnstileProblem } from "@/lib/login";
import { OWNER_ID, OWNER_PLACEHOLDER_EMAIL } from "@/lib/owner";
import { EmailForm, OwnerPasswordForm } from "./forms";

export const metadata: Metadata = { title: "Log in · Gigs" };

/** Whether the owner still logs in with DASHBOARD_PASSWORD, because he hasn't added his email. */
async function ownerUsesPassword(): Promise<boolean> {
  if (!process.env.DASHBOARD_PASSWORD) return false;
  const owner = await db.user.findUnique({ where: { id: OWNER_ID }, select: { email: true } });
  return owner?.email === OWNER_PLACEHOLDER_EMAIL;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next: askedNext, error } = await searchParams;
  const next = safeNext(askedNext);
  const problem = authProblem();
  // Checked here, not in the proxy: a stale cookie there would bounce between this page and the dashboard.
  if (!problem && (await currentUser())) redirect(next);
  const linkProblem = turnstileProblem();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Gigs</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Sign in with a link sent to your email. New here? Same thing.</p>
      {problem ? (
        <p className="rounded-xl border border-warn/40 px-3 py-2 text-sm text-warn">
          Login isn&apos;t set up yet: {problem}. Add it in Vercel under Settings → Environment Variables, then
          redeploy.
        </p>
      ) : (
        <div className="space-y-6">
          {error && (
            <p role="alert" className="rounded-xl border border-bad/40 px-3 py-2 text-sm text-bad">
              That sign-in link didn&apos;t work. It may have expired or been used already, so send a new one.
            </p>
          )}
          {linkProblem ? (
            <p className="rounded-xl border border-warn/40 px-3 py-2 text-sm text-warn">
              Sign-in links aren&apos;t set up yet: {linkProblem}. Add them in Vercel under Settings → Environment
              Variables, then redeploy.
            </p>
          ) : (
            <EmailForm next={next} siteKey={process.env.TURNSTILE_SITE_KEY || null} />
          )}
          {(await ownerUsesPassword()) && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Have the dashboard password?</summary>
              <div className="mt-3">
                <OwnerPasswordForm next={next} />
              </div>
            </details>
          )}
        </div>
      )}
    </main>
  );
}
