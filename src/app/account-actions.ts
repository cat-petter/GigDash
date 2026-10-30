"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/dal";
import { DAILY_CAP_CODE } from "@/lib/limit-codes";
import { DAILY_CAP_MESSAGE } from "@/lib/limits";
import { looksLikeEmail } from "@/lib/login";
import { OWNER_PLACEHOLDER_EMAIL } from "@/lib/owner";

export type AddEmailState = { error: string | null; sentTo: string | null };

/** Signs out of this device only. */
export async function logOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

/**
 * The owner adding his own email, to sign in with links instead of the dashboard password. The
 * change only happens once he taps the link sent to it.
 */
export async function addEmail(_state: AddEmailState, form: FormData): Promise<AddEmailState> {
  const user = await requireUser("/");
  if (user.email !== OWNER_PLACEHOLDER_EMAIL) return { error: "Your email is already set.", sentTo: null };

  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!looksLikeEmail(email)) return { error: "That doesn't look like an email address.", sentTo: null };

  try {
    await auth.api.changeEmail({ body: { newEmail: email }, headers: await headers() });
  } catch (error) {
    console.error(error);
    if (isAPIError(error) && error.body?.code === DAILY_CAP_CODE) return { error: DAILY_CAP_MESSAGE, sentTo: null };
    return { error: "The email didn't send. Try again in a minute.", sentTo: null };
  }
  return { error: null, sentTo: email };
}
