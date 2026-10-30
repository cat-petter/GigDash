import { logOut } from "@/app/account-actions";
import type { SessionUser } from "@/lib/auth";
import { OWNER_PLACEHOLDER_EMAIL } from "@/lib/owner";
import { AddEmailForm } from "./AddEmailForm";
import { Card } from "./Card";

export function LogOutButton() {
  return (
    <form action={logOut}>
      <button type="submit" className="rounded-full border border-line px-4 py-1.5 text-sm font-medium">
        Log out
      </button>
    </form>
  );
}

/** Settings → Account: who's signed in, and logging out. */
export function AccountSettings({ user }: { user: SessionUser }) {
  const noEmail = user.email === OWNER_PLACEHOLDER_EMAIL;
  return (
    <Card title="Account">
      <p className="mb-3 text-sm">
        {noEmail ? (
          <>Signed in with the dashboard password. Add your email above to sign in with a link instead.</>
        ) : (
          <>
            Signed in as <strong>{user.email}</strong>.
          </>
        )}
      </p>
      <LogOutButton />
    </Card>
  );
}

/** Shown on every tab until the owner has added his email. */
export function AddEmailCard() {
  return (
    <Card
      title="Add your email"
      note="You'll sign in with a link sent there instead of the dashboard password, which stops working once you confirm it."
    >
      <AddEmailForm />
    </Card>
  );
}
