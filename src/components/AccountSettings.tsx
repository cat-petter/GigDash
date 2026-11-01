import Link from "next/link";
import { logOut, logOutEverywhere } from "@/app/account-actions";
import { deviceName, selfDeletionProblem } from "@/lib/accounts";
import { listDevices } from "@/lib/accounts-store";
import type { SessionUser } from "@/lib/auth";
import { currentSessionId } from "@/lib/dal";
import { dayInZone } from "@/lib/dates";
import { formatDay } from "@/lib/format";
import { OWNER_PLACEHOLDER_EMAIL } from "@/lib/owner";
import { AddEmailForm } from "./AddEmailForm";
import { Card } from "./Card";
import { DeleteAccountForm } from "./DeleteAccountForm";

export function LogOutButton() {
  return (
    <form action={logOut}>
      <button type="submit" className="rounded-full border border-line px-4 py-1.5 text-sm font-medium">
        Log out
      </button>
    </form>
  );
}

/** Settings → Account: who's signed in, on which devices, and leaving. */
export async function AccountSettings({ user, timeZone }: { user: SessionUser; timeZone: string }) {
  const noEmail = user.email === OWNER_PLACEHOLDER_EMAIL;
  const [devices, thisDevice] = await Promise.all([listDevices(user.id), currentSessionId()]);
  return (
    <>
      <Card title="Account">
        <p className="mb-3 text-sm break-words">
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

      <Card title="Signed-in devices" note="A device stays signed in until you log out, or until it goes 90 days without opening the app.">
        <ul className="mb-3 divide-y divide-line">
          {devices.map((device) => (
            <li key={device.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                {deviceName(device.userAgent)}
                {device.id === thisDevice && <span className="text-muted"> (this device)</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{formatDay(dayInZone(device.updatedAt, timeZone))}</span>
            </li>
          ))}
        </ul>
        <form action={logOutEverywhere}>
          <button type="submit" className="rounded-full border border-line px-4 py-1.5 text-sm font-medium">
            Log out everywhere
          </button>
        </form>
      </Card>

      <Card title="Delete account">
        {selfDeletionProblem(user) ? (
          <p className="text-sm text-muted">
            {selfDeletionProblem(user)} It runs this copy of the app, and without it nobody could manage the users.
          </p>
        ) : (
          <DeleteAccountForm />
        )}
      </Card>

      <p className="px-1 text-sm">
        <Link href="/privacy" className="text-accent">
          What&apos;s stored and why
        </Link>
      </p>
    </>
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
