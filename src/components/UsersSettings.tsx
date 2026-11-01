import { listUsers } from "@/lib/accounts-store";
import type { SessionUser } from "@/lib/auth";
import { emailsSentToday } from "@/lib/counters";
import { formatDateTime } from "@/lib/format";
import { DAILY_EMAIL_CAP } from "@/lib/limits";
import { Card } from "./Card";
import { RemoveUserButton } from "./RemoveUserButton";

/** Settings → Users, for the owner. listUsers checks that again, so this can't leak if it's rendered by mistake. */
export async function UsersSettings({ user, timeZone }: { user: SessionUser; timeZone: string }) {
  const [users, emails] = await Promise.all([listUsers(user), emailsSentToday()]);
  return (
    <>
      <Card title="Sign-in emails today" note="All users together. It starts over at midnight UTC.">
        <p className="text-sm font-semibold tabular-nums">
          {emails} of {DAILY_EMAIL_CAP}
        </p>
      </Card>
      <Card title={`Users (${users.length})`} note="Removing someone deletes their account and data. They could sign up again.">
        <ul className="divide-y divide-line">
          {users.map((person) => (
            <li key={person.id} className="flex items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium break-words">
                  {person.email}
                  {person.id === user.id && <span className="font-normal text-muted"> (you)</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {person.lastSyncedAt ? `Last synced ${formatDateTime(person.lastSyncedAt, timeZone)}` : "Never synced"}
                </p>
              </div>
              {!person.isOwner && <RemoveUserButton userId={person.id} email={person.email} />}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
