// "Delete Everything" and "Delete my account", kept out of the Settings page
// so they can be tested.
//
// Delete Everything used to remove four tables and leave the rest: custom
// categories, the advisor's write-ups of the user's money, the name and phone
// number on the profile, and several lists kept in the browser.
import type { SupabaseClient } from '@supabase/supabase-js';

type QueryError = { message: string; code?: string };

// Transactions go before accounts: deleting an account cascades to its
// transactions and fires the balance trigger, which deadlocks against a
// transactions delete running at the same time. Goal contributions go with
// their goal (ON DELETE CASCADE).
const MONEY_TABLES = ['transactions', 'budgets', 'goals', 'accounts'] as const;

// Each of these arrived in a later migration, and migrations here are applied
// by hand. A table that was never created holds nothing to delete, so that
// one error is not a failure.
const LATER_TABLES = ['advisor_sessions', 'custom_categories', 'user_settings'] as const;
const isMissingTable = (e: QueryError) => e.code === 'PGRST205' || e.code === '42P01';

/**
 * Remove everything the signed-in user stored, except the sign-in itself.
 *
 * What stays, because row level security gives the browser no way to remove
 * it: the profile row (name and phone are blanked here; currency and email
 * alerts are kept as plain preferences), the notification log (send times
 * only) and the photo. Storage has no DELETE policy, so the photo file cannot
 * be removed from here; its link stays on the profile too, so the user still
 * sees the photo that is still stored. Deleting the account removes all of it.
 *
 * Runs table by table and stops at the first error. There is no transaction
 * across the calls, so a failure can leave some tables already empty; running
 * it again finishes the job.
 */
export async function deleteEverything(client: SupabaseClient, userId: string): Promise<void> {
  for (const table of MONEY_TABLES) {
    const { error } = await client.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  for (const table of LATER_TABLES) {
    const { error } = await client.from(table).delete().eq('user_id', userId);
    if (error && !isMissingTable(error)) throw new Error(`${table}: ${error.message}`);
  }
  // No DELETE policy on profiles, and the app needs the row. Blank the personal fields.
  const { error } = await client.from('profiles')
    .update({ display_name: null, phone_number: null, notify_sms: false })
    .eq('user_id', userId);
  if (error) throw new Error(`profiles: ${error.message}`);
}

// Per-device choices that say nothing about the user's money. Kept by Delete
// Everything, removed with the account.
const DEVICE_KEYS = ['balanceHidden', 'secondaryCurrency'];

/**
 * Remove what the app keeps in this browser: net worth history, income,
 * payday, budget templates, alert history, cached rates. Every such key
 * starts with "spendpal", so a key added later is covered too.
 * `account: true` also removes the per-device choices.
 */
export function clearLocalData(storage: Storage, opts: { account?: boolean } = {}): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) keys.push(key);
    }
    for (const key of keys) {
      if (/^spendpal[_-]/.test(key) || (opts.account && DEVICE_KEYS.includes(key))) storage.removeItem(key);
    }
  } catch { /* storage blocked: nothing was kept there either */ }
}

export type DeleteAccountOutcome =
  | 'deleted'      // the sign-in and every row are gone
  | 'unavailable'  // the server has no delete-account function yet; nothing was touched
  | 'failed'       // the function answered with an error; the account still exists
  | 'unreachable'; // no answer from the server, so nothing can be said either way

type FunctionErrorLike = { name?: string; context?: { status?: number } | null };

// The request never reached a running function: not deployed (404, or a
// blocked preflight that the browser reports as a failed fetch) or a relay error.
const neverRan = (e: FunctionErrorLike) =>
  e.name === 'FunctionsFetchError' || e.name === 'FunctionsRelayError' ||
  (e.name === 'FunctionsHttpError' && e.context?.status === 404);

/**
 * Ask the server to delete the signed-in user (edge function "delete-account":
 * removes the avatar files, then the auth user; every table cascades).
 *
 * The browser cannot do this itself, and deleting the rows without the
 * sign-in would be a second "Delete Everything" under a false name. So when
 * the function is missing, nothing is deleted at all.
 *
 * After any failure the server is asked whether the user still exists: an
 * answer can be lost after the work is done, and telling a deleted user that
 * nothing happened would leave them stuck in a dead session.
 */
export async function deleteAccount(client: SupabaseClient): Promise<DeleteAccountOutcome> {
  let ran = true;
  try {
    const { data, error } = await client.functions.invoke('delete-account', { method: 'POST' });
    if (!error && (data as { ok?: boolean } | null)?.ok === true) return 'deleted';
    if (error && neverRan(error as FunctionErrorLike)) ran = false;
  } catch {
    ran = false;
  }
  try {
    const { data, error } = await client.auth.getUser();
    if (error && (error.code === 'user_not_found' || error.status === 404)) return 'deleted';
    if (error || !data.user) return 'unreachable';
  } catch {
    return 'unreachable';
  }
  return ran ? 'failed' : 'unavailable';
}
