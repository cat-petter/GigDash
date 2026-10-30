import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/login";

// The token is in this page's address, so it mustn't be sent on to anywhere else.
export const metadata: Metadata = { title: "Sign in · Gigs", referrer: "no-referrer" };

const BUTTON = "block w-full rounded-full bg-fg py-2 text-center font-medium text-bg";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Where emailed links land. Signing in takes a tap on a button, because some mail scanners open
 * every link in a message, which would use up a link that works only once.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/login/confirm">) {
  const params = await searchParams;
  const token = first(params.token);
  const email = first(params.type) === "email";

  let body: React.ReactNode;
  if (first(params.error)) {
    body = (
      <>
        <p className="mb-6 text-sm text-bad">That link didn&apos;t work. It may have expired or been used already.</p>
        <Link href={email ? "/?tab=settings&section=account" : "/login"} className={BUTTON}>
          {email ? "Back to the dashboard" : "Send a new link"}
        </Link>
      </>
    );
  } else if (first(params.done)) {
    body = (
      <>
        <p className="mb-6 text-sm">Your email is confirmed. From now on, you&apos;ll sign in with a link sent there.</p>
        <Link href="/" className={BUTTON}>
          Open the dashboard
        </Link>
      </>
    );
  } else if (!token || token.length > 2000) {
    body = (
      <>
        <p className="mb-6 text-sm text-bad">This link is missing part of it. Open it from the email again.</p>
        <Link href="/login" className={BUTTON}>
          Send a new link
        </Link>
      </>
    );
  } else {
    body = (
      // A GET form, because Better Auth checks links with a GET. It signs in and redirects.
      <form method="get" action={email ? "/api/auth/verify-email" : "/api/auth/magic-link/verify"}>
        <input type="hidden" name="token" value={token} />
        {email ? (
          <input type="hidden" name="callbackURL" value="/login/confirm?type=email&done=1" />
        ) : (
          <>
            <input type="hidden" name="callbackURL" value={safeNext(first(params.next))} />
            <input type="hidden" name="errorCallbackURL" value="/login" />
          </>
        )}
        <p className="mb-6 text-sm text-muted">
          {email ? "Tap to confirm your email." : "Tap to finish signing in on this device."}
        </p>
        <button type="submit" className={BUTTON}>
          {email ? "Confirm email" : "Sign in"}
        </button>
      </form>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Gigs</h1>
      {body}
    </main>
  );
}
