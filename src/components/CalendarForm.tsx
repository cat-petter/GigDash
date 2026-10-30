"use client";

import { useActionState, useState, useTransition } from "react";
import {
  type CalendarCheck,
  type CalendarResult,
  disconnectAction,
  saveCalendarAction,
  testConnectionAction,
} from "@/app/calendar-actions";
import type { CalendarFields, CalendarSettings } from "@/lib/credentials";
import { CalendarList } from "./CalendarList";

// 16px text, so iPhone doesn't zoom in on the field.
const INPUT = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-base";

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {note && <span className="block text-xs text-muted">{note}</span>}
      {children}
    </label>
  );
}

/** Settings → Calendar. The saved password never comes back to the browser, so its field starts empty. */
export function CalendarForm({ settings, zones }: { settings: CalendarSettings; zones: string[] }) {
  const [state, action, saving] = useActionState<CalendarResult, FormData>(saveCalendarAction, {
    error: null,
    saved: false,
    check: null,
    fields: null,
  });
  const [testing, startTest] = useTransition();
  const [tested, setTested] = useState<{ error: string | null; check: CalendarCheck | null } | null>(null);
  const busy = saving || testing;

  const fields: CalendarFields = state.fields ?? {
    name: settings.name,
    timeZone: settings.timeZone,
    trackFrom: settings.trackFrom ?? "",
    icloudEmail: settings.icloudEmail,
    gigsCalendar: settings.names.gigs,
    holdsCalendar: settings.names.holds ?? "",
    wantedCalendar: settings.names.wanted,
  };
  const check = tested?.check ?? (tested ? null : state.check);

  function test() {
    startTest(async () => setTested(await testConnectionAction()));
  }

  function disconnect() {
    if (!window.confirm("Disconnect iCloud? This erases the saved password. Your gigs stay, but stop updating.")) return;
    startTest(async () => {
      await disconnectAction();
      setTested(null);
    });
  }

  return (
    // Keyed by what's shown, because React clears a form once its action finishes.
    <form key={JSON.stringify(fields)} action={action} onSubmit={() => setTested(null)} className="space-y-4">
      {settings.fromEnv && settings.connected && (
        <p className="text-sm text-muted">
          These come from the server&apos;s settings for now. Saving here moves them to your account.
        </p>
      )}
      <Field label="Your name" note="For the greeting on the Overview. Optional.">
        <input name="name" defaultValue={fields.name} maxLength={80} autoComplete="given-name" className={INPUT} />
      </Field>
      <Field label="iCloud email">
        <input
          type="email"
          name="icloudEmail"
          required
          defaultValue={fields.icloudEmail}
          autoComplete="off"
          placeholder="you@icloud.com"
          className={INPUT}
        />
      </Field>
      <Field
        label="App-specific password"
        note="Make one at account.apple.com under Sign-In and Security, and revoke it there at any time. It also opens your iCloud mail and contacts, so it's stored encrypted, only used to read these calendars, and never shown again."
      >
        <input
          type="password"
          name="password"
          required={!settings.connected}
          maxLength={256}
          autoComplete="new-password"
          placeholder={settings.connected ? "Saved. Leave empty to keep it." : "xxxx-xxxx-xxxx-xxxx"}
          className={INPUT}
        />
      </Field>
      <Field label="Gigs calendar" note="The exact name in Apple Calendar.">
        <input name="gigsCalendar" defaultValue={fields.gigsCalendar} maxLength={100} placeholder="Gigs" className={INPUT} />
      </Field>
      <Field label="Holds calendar" note="Leave empty if you don't have one yet.">
        <input name="holdsCalendar" defaultValue={fields.holdsCalendar} maxLength={100} className={INPUT} />
      </Field>
      <Field label="Wanted calendar" note="Dates you were asked for but weren't free. Read only if it exists.">
        <input name="wantedCalendar" defaultValue={fields.wantedCalendar} maxLength={100} placeholder="Wanted" className={INPUT} />
      </Field>
      <Field label="Time zone" note="Lead times and dates are counted in this zone.">
        <select name="timeZone" defaultValue={fields.timeZone} className={INPUT}>
          {(zones.includes(fields.timeZone) ? zones : [fields.timeZone, ...zones]).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Track gigs from"
        note="Events before this date are ignored and removed from the dashboard, never from your calendar. Leave empty to read everything."
      >
        <input type="date" name="trackFrom" defaultValue={fields.trackFrom} className={INPUT} />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      {tested?.error && (
        <p role="alert" className="text-sm text-bad">
          {tested.error}
        </p>
      )}
      {state.saved && !tested && <p className="text-sm text-good">Saved. Your gigs update on the next sync.</p>}
      {check && (
        <div>
          <CalendarList found={check.found} names={check.names} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-fg px-4 py-1.5 text-sm font-medium text-bg disabled:opacity-60"
        >
          {saving ? "Checking iCloud…" : "Save"}
        </button>
        {settings.connected && (
          <button type="button" onClick={test} disabled={busy} className="text-sm text-accent disabled:opacity-60">
            {testing ? "Working…" : "Test connection"}
          </button>
        )}
        {settings.connected && !settings.fromEnv && (
          <button type="button" onClick={disconnect} disabled={busy} className="text-sm text-bad disabled:opacity-60">
            Disconnect
          </button>
        )}
      </div>
    </form>
  );
}
