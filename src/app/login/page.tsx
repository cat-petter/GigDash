import type { Metadata } from "next";
import { authProblem, safeNext } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in · Gigs" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const problem = authProblem();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Gigs</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Enter the dashboard password.</p>
      {problem ? (
        <p className="rounded-xl border border-warn/40 px-3 py-2 text-sm text-warn">
          Login isn&apos;t set up yet: {problem}. Add it in Vercel under Settings → Environment Variables, then
          redeploy.
        </p>
      ) : (
        <LoginForm next={safeNext(next)} />
      )}
    </main>
  );
}
