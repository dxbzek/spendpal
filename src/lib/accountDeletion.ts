// "Delete Everything" and "Delete my account", kept out of the Settings page
// so they can be tested.
//
// Delete Everything used to remove four tables and leave the rest: custom
// categories, the advisor's write-ups of the user's money, the name and phone
// number on the profile, and several lists kept in the browser.
import type { SupabaseClient } from '@supabase/supabase-js';
import { keyOwner } from '@/lib/userStorage';

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
 * What happened to the profile photo.
 * 'removed': the files are gone and the link with them.
 * 'none': there was no stored photo (no link, or a link to another site, which is cleared).
 * 'kept': a stored photo could not be removed, so its link stays and the user is told.
 */
export type PhotoOutcome = 'removed' | 'none' | 'kept';

const AVATAR_BUCKET = 'avatars';

/**
 * Remove the user's photo files from storage (avatars/<user id>/).
 *
 * The storage policies that let a user see and delete their own folder
 * arrive with the review-fixes migration, which is applied by hand. Without
 * them the list comes back empty and a remove answers "ok" and deletes
 * nothing. So the result is never taken from the remove call: the folder is
 * listed again afterwards, and a photo the profile links to that the list
 * cannot show is reported as kept.
 *
 * Files in subfolders are not listed here; the app never writes any.
 * Deleting the account removes the whole folder on the server.
 */
export async function removeAvatarFiles(client: SupabaseClient, userId: string): Promise<PhotoOutcome> {
  const { data: profile } = await client.from('profiles').select('avatar_url').eq('user_id', userId).maybeSingle();
  const link = (profile as { avatar_url?: string | null } | null)?.avatar_url ?? '';
  const linksStoredPhoto = link.includes(`/${AVATAR_BUCKET}/${userId}/`);

  const bucket = client.storage.from(AVATAR_BUCKET);
  const before = await bucket.list(userId);
  if (before.error) return linksStoredPhoto ? 'kept' : 'none';
  // Folders come back with no id.
  const paths = (before.data ?? []).filter(o => o.id !== null).map(o => `${userId}/${o.name}`);
  if (paths.length === 0) return linksStoredPhoto ? 'kept' : 'none';

  const removed = await bucket.remove(paths);
  if (removed.error) return 'kept';
  const after = await bucket.list(userId);
  if (after.error) return 'kept';
  const left = (after.data ?? []).filter(o => paths.includes(`${userId}/${o.name}`));
  return left.length ? 'kept' : 'removed';
}

/**
 * Remove everything the signed-in user stored, except the sign-in itself.
 *
 * What stays: the profile row (name, phone and photo link are blanked here;
 * currency and email alerts are kept as plain preferences; row level
 * security has no DELETE for it) and the notification log (send times only,
 * SELECT only). The photo files are removed when storage allows it (see
 * removeAvatarFiles); when it does not, the link stays so the user still
 * sees the photo that is still stored, and `photo` says 'kept'.
 * Deleting the account removes all of it.
 *
 * Runs table by table and stops at the first error. There is no transaction
 * across the calls, so a failure can leave some tables already empty; running
 * it again finishes the job.
 */
export async function deleteEverything(client: SupabaseClient, userId: string): Promise<{ photo: PhotoOutcome }> {
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

  // Last: the rows above matter more than the photo, and a photo that stays
  // is reported, not treated as a failed delete.
  let photo: PhotoOutcome;
  try { photo = await removeAvatarFiles(client, userId); } catch { photo = 'kept'; }
  if (photo !== 'kept') {
    const { error: linkError } = await client.from('profiles').update({ avatar_url: null }).eq('user_id', userId);
    if (linkError) throw new Error(`profiles: ${linkError.message}`);
  }
  return { photo };
}

// Per-device choices that say nothing about the user's money. Kept by Delete
// Everything, removed with the account. DEVICE_KEYS are the old fixed names;
// USER_DEVICE_NAMES end the per-user keys (see userStorage.ts).
const DEVICE_KEYS = ['balanceHidden', 'secondaryCurrency'];
const USER_DEVICE_NAMES = ['balance_hidden'];

/**
 * Remove what the app keeps in this browser for this user: their copy of
 * their settings, the alert history, values still under the old fixed
 * names, and cached rates. Every such key starts with "spendpal", so a key
 * added later is covered too. The keys of another account that signs in on
 * this browser are left alone. `account: true` also removes the per-device choices.
 */
export function clearLocalData(storage: Storage, opts: { userId: string; account?: boolean }): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) keys.push(key);
    }
    for (const key of keys) {
      const owner = keyOwner(key);
      let remove: boolean;
      if (owner !== null) {
        const name = key.slice(key.lastIndexOf('.') + 1);
        remove = owner === opts.userId && (!!opts.account || !USER_DEVICE_NAMES.includes(name));
      } else {
        remove = /^spendpal[_-]/.test(key) || (!!opts.account && DEVICE_KEYS.includes(key));
      }
      if (remove) storage.removeItem(key);
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
