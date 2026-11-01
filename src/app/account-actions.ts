"use server";

import { isAPIError } from "better-auth/api";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { confirmsDeletion, removalProblem, selfDeletionProblem } from "@/lib/accounts";
import { deleteAccount } from "@/lib/accounts-store";
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

/** Ends every session this user has, this device's too. */
export async function logOutEverywhere() {
  await requireUser("/");
  const requestHeaders = await headers();
  await auth.api.revokeSessions({ headers: requestHeaders });
  // The session is gone by now; this clears its cookie.
  await auth.api.signOut({ headers: requestHeaders });
  redirect("/login");
}

export type DeleteAccountState = { error: string | null };

/** Deletes the signed-in user's own account, once they've typed their email. */
export async function deleteOwnAccount(_state: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  const user = await requireUser("/");
  const problem = selfDeletionProblem(user);
  if (problem) return { error: problem };
  if (!confirmsDeletion(String(form.get("email") ?? ""), user.email)) {
    return { error: "That isn't the email on this account." };
  }
  try {
    if (!(await deleteAccount(user.id))) return { error: "That account can't be deleted." };
  } catch (error) {
    console.error(error);
    return { error: "That didn't work, and nothing was deleted. Try again in a minute." };
  }
  await auth.api.signOut({ headers: await headers() });
  redirect("/login?deleted=1");
}

/** The owner removing someone. The asker comes from the session; only the target comes from the request. */
export async function removeUser(targetId: string): Promise<{ error: string | null }> {
  const asker = await requireUser("/");
  const problem = removalProblem(asker, targetId);
  if (problem) return { error: problem };
  try {
    if (!(await deleteAccount(targetId))) return { error: "That user can't be removed." };
  } catch (error) {
    console.error(error);
    return { error: "That didn't work, and nothing was deleted. Try again in a minute." };
  }
  refresh();
  return { error: null };
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
