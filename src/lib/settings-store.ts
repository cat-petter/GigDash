import { dayToDate } from "./dates";
import { calendarSettings, type CalendarSettings, type CalendarValues, encrypt, type IcloudCredentials, icloudCredentials } from "./credentials";
import { db, forUser } from "./db";

async function stored(userId: string) {
  const [user, account] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isOwner: true, name: true, timeZone: true, trackFrom: true },
    }),
    forUser(userId).calendarAccount.findUnique({ where: { userId } }),
  ]);
  return { user, account };
}

export async function loadSettings(userId: string): Promise<CalendarSettings> {
  const { user, account } = await stored(userId);
  return calendarSettings(user, account);
}

/** Decrypts the iCloud password. Only the sync and the connection checks should call this. */
export async function loadCredentials(userId: string): Promise<IcloudCredentials | null> {
  const { user, account } = await stored(userId);
  return icloudCredentials(userId, user, account);
}

export async function saveCalendar(userId: string, values: CalendarValues, password: string) {
  const { name, timeZone, trackFrom, ...calendar } = values;
  const { value: icloudPasswordEnc, keyVersion } = encrypt(password, userId);
  const row = { ...calendar, icloudPasswordEnc, keyVersion };
  await forUser(userId).$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { name, timeZone, trackFrom: trackFrom && dayToDate(trackFrom) },
    });
    await tx.calendarAccount.upsert({ where: { userId }, create: { userId, ...row }, update: row });
  });
}

/** Erases the stored password. The gigs already read stay. */
export async function disconnectCalendar(userId: string) {
  await forUser(userId).calendarAccount.deleteMany();
}
