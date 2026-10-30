"use server";

import { refresh } from "next/cache";
import { listCalendarNames } from "@/lib/caldav";
import { type CalendarNames, calendarProblems } from "@/lib/calendar-names";
import { hitCounter } from "@/lib/counters";
import { type CalendarFields, parseCalendarFields } from "@/lib/credentials";
import { requireUser } from "@/lib/dal";
import { connectionCheckAllowed } from "@/lib/limits";
import { disconnectCalendar, loadCredentials, loadSettings, saveCalendar } from "@/lib/settings-store";

const TOO_MANY_CHECKS = "That's a lot of tries with iCloud. Wait 15 minutes, so Apple doesn't lock the account.";

export type CalendarCheck = { found: string[]; names: CalendarNames };

export type CalendarResult = {
  error: string | null;
  saved: boolean;
  /** What iCloud listed, when it was reached. */
  check: CalendarCheck | null;
  /** What was typed, to show again. Never the password. */
  fields: CalendarFields | null;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

/**
 * Saves the form, but only once iCloud has taken these details and has these calendars, so a typo
 * shows up here rather than as a failed sync later. Leaving the password empty keeps the saved one,
 * unless the email changed: a saved password is only ever tried on the account it came with.
 */
export async function saveCalendarAction(_state: CalendarResult, form: FormData): Promise<CalendarResult> {
  const userId = (await requireUser("/")).id;
  const fields: CalendarFields = {
    name: text(form, "name"),
    timeZone: text(form, "timeZone"),
    trackFrom: text(form, "trackFrom"),
    icloudEmail: text(form, "icloudEmail"),
    gigsCalendar: text(form, "gigsCalendar"),
    holdsCalendar: text(form, "holdsCalendar"),
    wantedCalendar: text(form, "wantedCalendar"),
  };
  const refuse = (error: string, check: CalendarCheck | null = null): CalendarResult => ({ error, saved: false, check, fields });

  const parsed = parseCalendarFields(fields);
  if ("error" in parsed) return refuse(parsed.error);
  const { values } = parsed;
  const names = { gigs: values.gigsCalendar, holds: values.holdsCalendar, wanted: values.wantedCalendar };

  let password = text(form, "password").trim();
  if (password.length > 256) return refuse("That password is too long to be an app-specific password.");
  if (!password) {
    const current = await loadSettings(userId);
    const sameAccount = current.connected && current.icloudEmail.toLowerCase() === values.icloudEmail.toLowerCase();
    if (!sameAccount) return refuse("Enter the app-specific password for this iCloud email.");
    try {
      password = (await loadCredentials(userId))?.password ?? "";
    } catch (error) {
      return refuse(messageOf(error));
    }
    if (!password) return refuse("Enter the app-specific password for this iCloud email.");
  }

  if (!(await connectionCheckAllowed(userId, hitCounter))) return refuse(TOO_MANY_CHECKS);

  let found: string[];
  try {
    found = await listCalendarNames({ email: values.icloudEmail, password });
  } catch (error) {
    return refuse(messageOf(error));
  }
  const check = { found, names };
  // The list that comes back says which calendar is the problem.
  if (calendarProblems(found, names).length > 0) return refuse("Not saved. Check the calendar names.", check);

  try {
    await saveCalendar(userId, values, password);
  } catch (error) {
    console.error(error);
    return refuse("That didn't save. Connecting calendars may not be set up on this server yet.", check);
  }
  refresh();
  return { error: null, saved: true, check, fields };
}

/** Signs in with what's saved and lists the calendars. */
export async function testConnectionAction(): Promise<{ error: string | null; check: CalendarCheck | null }> {
  const userId = (await requireUser("/")).id;
  try {
    const [credentials, { names }] = await Promise.all([loadCredentials(userId), loadSettings(userId)]);
    if (!credentials) return { error: "No iCloud calendar is connected.", check: null };
    if (!(await connectionCheckAllowed(userId, hitCounter))) return { error: TOO_MANY_CHECKS, check: null };
    return { error: null, check: { found: await listCalendarNames(credentials), names } };
  } catch (error) {
    return { error: messageOf(error), check: null };
  }
}

export async function disconnectAction() {
  const userId = (await requireUser("/")).id;
  await disconnectCalendar(userId);
  refresh();
}
