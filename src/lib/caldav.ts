import { createDAVClient, type DAVCalendar } from "tsdav";
import type { GigCalendar } from "@/generated/prisma/client";
import type { CalendarNames } from "./calendar-names";
import type { IcloudCredentials } from "./credentials";

const SERVER_URL = "https://caldav.icloud.com";
const TIMEOUT_MS = 45_000;

// CalDAV reads use these methods. Writes would need PUT, DELETE, MKCALENDAR or PROPPATCH.
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PROPFIND", "REPORT"]);

/** `data` is null when iCloud listed an event but didn't send its contents. */
export type CalendarObject = { url: string; data: string | null };

export type FetchedCalendar = {
  calendar: GigCalendar;
  /** The calendar's name as it appears in Apple Calendar. */
  name: string;
  objects: CalendarObject[];
};

/** Refuses any request that could change the calendar, so the app can only ever read it. */
const readOnlyFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (!READ_METHODS.has(method)) {
    return Promise.reject(new Error(`Blocked a ${method} request: this app only reads the calendar`));
  }
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
};

async function connect({ email, password }: IcloudCredentials) {
  try {
    return await createDAVClient({
      serverUrl: SERVER_URL,
      credentials: { username: email, password },
      authMethod: "Basic",
      defaultAccountType: "caldav",
      fetch: readOnlyFetch,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Couldn't sign in to iCloud (${message}). Check the iCloud email, and that the password is an app-specific password that hasn't been revoked.`,
    );
  }
}

function nameOf(calendar: DAVCalendar): string {
  const name: unknown = calendar.displayName;
  if (typeof name === "string") return name.trim();
  // tsdav hands back the XML node when the name comes with attributes.
  if (name && typeof name === "object" && "_text" in name) return String(name._text).trim();
  return "";
}

/** Calendars that hold events, leaving out Reminders lists. */
function eventCalendars(calendars: DAVCalendar[]): DAVCalendar[] {
  return calendars.filter((calendar) => !calendar.components?.length || calendar.components.includes("VEVENT"));
}

function findCalendar(calendars: DAVCalendar[], name: string): DAVCalendar {
  const wanted = name.toLowerCase();
  const matches = calendars.filter((calendar) => nameOf(calendar).toLowerCase() === wanted);
  if (matches.length === 1) return matches[0];

  const names = calendars.map((calendar) => `"${nameOf(calendar)}"`).join(", ");
  if (matches.length > 1) {
    throw new Error(`There are ${matches.length} calendars named "${name}". Rename one in Apple Calendar.`);
  }
  throw new Error(`No calendar named "${name}". Check the names under Settings → Calendar. The calendars on this account are: ${names}.`);
}

/** Names of the event calendars on the account, for the status page. Reads no events. */
export async function listCalendarNames(credentials: IcloudCredentials): Promise<string[]> {
  const client = await connect(credentials);
  return eventCalendars(await client.fetchCalendars()).map(nameOf);
}

/**
 * Fetches every event in the gigs, holds and wanted calendars, found by name.
 * No other calendar's events are requested.
 */
export async function fetchGigCalendars(credentials: IcloudCredentials, names: CalendarNames): Promise<FetchedCalendar[]> {
  const client = await connect(credentials);
  const calendars = eventCalendars(await client.fetchCalendars());

  const wanted: { calendar: GigCalendar; dav: DAVCalendar }[] = [
    { calendar: "gigs", dav: findCalendar(calendars, names.gigs) },
  ];
  if (names.holds) {
    const holds = findCalendar(calendars, names.holds);
    if (holds.url === wanted[0].dav.url) {
      throw new Error("The gigs and holds calendars are the same calendar");
    }
    wanted.push({ calendar: "holds", dav: holds });
  }
  const asked = calendars.filter((calendar) => nameOf(calendar).toLowerCase() === names.wanted.toLowerCase());
  if (asked.length > 1) {
    throw new Error(`There are ${asked.length} calendars named "${names.wanted}". Rename one in Apple Calendar.`);
  }
  if (asked.length === 1) {
    if (wanted.some(({ dav }) => dav.url === asked[0].url)) {
      throw new Error("The wanted calendar is the same calendar as the gigs or holds one");
    }
    wanted.push({ calendar: "wanted", dav: asked[0] });
  }

  return Promise.all(
    wanted.map(async ({ calendar, dav }) => {
      const objects = await client.fetchCalendarObjects({ calendar: dav });
      return {
        calendar,
        name: nameOf(dav),
        objects: objects.map((object) => ({
          url: object.url,
          data: typeof object.data === "string" ? object.data : null,
        })),
      };
    }),
  );
}
