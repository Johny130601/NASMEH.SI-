/**
 * Structured ticket answers keep calendar dates as ISO strings (2026-09-20);
 * staff read them in the Slovenian form "20. 9. 2026", in the admin inbox and in
 * the staff mail alike (QA T4-F11). A string that only looks like a date
 * (2026-02-30) is left as typed. Pure: the mail templates import it without Prisma.
 */
export function readableDetailValue(value: string): string {
  return value.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, year: string, month: string, day: string) => {
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day) ? `${Number(day)}. ${Number(month)}. ${year}` : match;
  });
}
