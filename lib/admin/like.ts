/**
 * % and _ are literal characters of a typed admin search, never wildcards
 * (QA T5-06). Prisma's `contains` renders a LIKE without escaping them, so
 * every admin text filter (and the raw ILIKE name searches) passes the typed
 * text through this first; the backslash is PostgreSQL's default LIKE escape.
 */
export const likeEscaped = (value: string) => value.replace(/[\\%_]/g, (character) => `\\${character}`);
