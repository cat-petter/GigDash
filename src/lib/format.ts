import { type Day, dayToDate } from "./dates";

/** "just now", "5 min ago", "3 hr ago", "2 days ago". */
export function timeAgo(then: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** "Sep 24, 2:05 PM" in the given zone. */
export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** "$1,250" */
export function formatMoney(dollars: number): string {
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

/** "1 job", "3 jobs" */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/** "Sep 24, 2026" for a calendar day. */
export function formatDay(day: Day): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(
    dayToDate(day),
  );
}

/** "Good afternoon, Yechiel!" by the hour in the given zone: morning from 5, afternoon from 12, evening from 5 PM. */
export function greeting(now: Date, timeZone: string, name?: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  const part = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : "evening";
  return name ? `Good ${part}, ${name}!` : `Good ${part}!`;
}
