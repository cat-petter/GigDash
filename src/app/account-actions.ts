"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/dal";
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
    return { error: "The email didn't send. Try again in a minute.", sentTo: null };
  }
  return { error: null, sentTo: email };
}
