// How many AI calls a user may make, and how each call is counted.
// This file has no Deno or npm imports, so the app's unit tests can load it.
// The database part is behind UsageStore; ai-finance/usageStore.ts fills it in.

export const AI_REQUEST_TYPES = [
  "summary",
  "budget-suggestions",
  "categorize-csv",
  "categorize-image",
  "categorize-image-budgets",
  "categorize-image-goals",
  "monthly-report",
  "budget-advisor",
] as const;
export type AiRequestType = typeof AI_REQUEST_TYPES[number];

/** Calls one user may make in one UTC day. */
export const DAILY_USER_LIMIT = 30;
/** Calls all users together may make in one UTC day, unless AI_DAILY_CEILING says otherwise. */
export const DEFAULT_DAILY_CEILING = 300;

/**
 * The most the model may write for each request type. The count includes the
 * model's thinking, which cannot be turned off on this model, so each figure
 * leaves room for it. Extraction keeps the full 16000: an answer cut short
 * there would lose statement rows.
 */
export const MAX_TOKENS: Record<AiRequestType, number> = {
  "summary": 3000,
  "monthly-report": 5000,
  "budget-suggestions": 6000,
  "budget-advisor": 16000,
  "categorize-csv": 16000,
  "categorize-image": 16000,
  "categorize-image-budgets": 16000,
  "categorize-image-goals": 16000,
};

/** The usage day: the UTC date, the same for every user. */
export function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The AI_DAILY_CEILING secret as a number. 0 is valid and turns AI off for
 * everyone. Anything that is not a whole number falls back to the default.
 */
export function parseCeiling(raw: string | undefined | null): number {
  if (typeof raw !== "string" || !/^\d{1,9}$/.test(raw.trim())) return DEFAULT_DAILY_CEILING;
  return Number(raw.trim());
}

export function remainingAfter(calls: number, limit: number = DAILY_USER_LIMIT): number {
  return Math.max(0, limit - calls);
}

/** The four database steps the counter needs. Each throws when the database fails. */
export interface UsageStore {
  /** Sum of calls by all users on that day. May stop adding once it reaches `upTo`. */
  totalToday(day: string, upTo: number): Promise<number>;
  /** The user's calls on that day, or null when there is no row yet. */
  read(userId: string, day: string): Promise<number | null>;
  /** Insert the row with calls = 1. False when another request inserted it first. */
  insertFirst(userId: string, day: string): Promise<boolean>;
  /** Set calls to from + 1, only if calls is still `from`. False when it changed. */
  bump(userId: string, day: string, from: number): Promise<boolean>;
}

export type CountResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: "user" | "ceiling"; remaining: 0 };

/**
 * Count one call for the user, before the model runs. Refuses when the user
 * is at the limit or all users together are at the ceiling.
 *
 * Two requests at the same moment must not both take the last use. So the
 * write only succeeds if the count is still the one that was read; the loser
 * reads again. A store error is thrown to the caller, which must refuse the
 * request: no count, no model call.
 */
export async function countCall(
  store: UsageStore,
  userId: string,
  day: string,
  limit: number = DAILY_USER_LIMIT,
  ceiling: number = DEFAULT_DAILY_CEILING,
): Promise<CountResult> {
  if (ceiling <= 0 || (await store.totalToday(day, ceiling)) >= ceiling) {
    return { ok: false, reason: "ceiling", remaining: 0 };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const calls = await store.read(userId, day);
    if ((calls ?? 0) >= limit) return { ok: false, reason: "user", remaining: 0 };
    const written = calls === null
      ? await store.insertFirst(userId, day)
      : await store.bump(userId, day, calls);
    if (written) return { ok: true, remaining: remainingAfter((calls ?? 0) + 1, limit) };
  }
  throw new Error("ai_usage: the call could not be recorded after 5 tries");
}

/** What the user is told when a call is refused. */
export function refusalMessage(reason: "user" | "ceiling", limit: number = DAILY_USER_LIMIT): string {
  return reason === "user"
    ? `You have used all ${limit} AI uses for today. The count resets at 00:00 UTC.`
    : "AI has reached its daily limit for all users. Try again after 00:00 UTC.";
}
