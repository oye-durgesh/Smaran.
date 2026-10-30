// India has no daylight saving, so Asia/Kolkata is a fixed UTC+05:30.
export const IST_OFFSET_MIN = 330;
export type Clock = () => Date;

const pad = (n: number) => String(n).padStart(2, '0');

/** Date parts as seen on a clock in Asia/Kolkata. */
export function istParts(d: Date) {
  const s = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
  return {
    date: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`,
    time: `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`,
    weekday: s.getUTCDay(), // 0 = Sunday
  };
}

/** Convert an IST wall-clock date (YYYY-MM-DD) and time (HH:MM) to a UTC Date. */
export function fromIst(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MIN * 60000);
}

export const addMinutes = (d: Date, min: number) => new Date(d.getTime() + min * 60000);
