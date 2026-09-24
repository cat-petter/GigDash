"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  authProblem,
  checkPassword,
  createSession,
  safeNext,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export type LoginState = { error: string | null };

/** A pause after a wrong password, so guessing is slow. */
const WRONG_PASSWORD_DELAY_MS = 1000;

export async function logIn(_state: LoginState, form: FormData): Promise<LoginState> {
  const problem = authProblem();
  if (problem) return { error: `Login isn't set up yet: ${problem}.` };

  const password = form.get("password");
  if (typeof password !== "string" || !checkPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return { error: "That password didn't work." };
  }

  (await cookies()).set(SESSION_COOKIE, createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  redirect(safeNext(form.get("next")));
}
