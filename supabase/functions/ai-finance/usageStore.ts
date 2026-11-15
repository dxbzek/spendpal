// The ai_usage table behind the call counter in _shared/aiLimits.ts.
// It is written with the service role only: a user can read their own rows
// but cannot lower their own count.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { UsageStore } from "../_shared/aiLimits.ts";

// The API returns 1000 rows at most for one request.
const MAX_ROWS = 1000;

export function usageStore(admin: SupabaseClient): UsageStore {
  return {
    // Every row here holds at least 1 call, so `upTo` rows are enough to know
    // the ceiling is reached. Largest counts first, so a cut-off list still
    // gives the highest sum those rows can give.
    async totalToday(day, upTo) {
      const { data, error } = await admin
        .from("ai_usage")
        .select("calls")
        .eq("day", day)
        .gte("calls", 1)
        .order("calls", { ascending: false })
        .limit(Math.min(Math.max(upTo, 1), MAX_ROWS));
      if (error) throw new Error(`ai_usage total: ${error.code ?? ""} ${error.message}`);
      return (data ?? []).reduce((sum: number, row: { calls: number }) => sum + (row.calls ?? 0), 0);
    },

    async read(userId, day) {
      const { data, error } = await admin
        .from("ai_usage")
        .select("calls")
        .eq("user_id", userId)
        .eq("day", day)
        .maybeSingle();
      if (error) throw new Error(`ai_usage read: ${error.code ?? ""} ${error.message}`);
      return data ? (data.calls as number) : null;
    },

    async insertFirst(userId, day) {
      const { error } = await admin.from("ai_usage").insert({ user_id: userId, day, calls: 1 });
      if (!error) return true;
      // 23505 = the row exists already: another request of the same user won.
      if (error.code === "23505") return false;
      throw new Error(`ai_usage insert: ${error.code ?? ""} ${error.message}`);
    },

    async bump(userId, day, from) {
      const { data, error } = await admin
        .from("ai_usage")
        .update({ calls: from + 1 })
        .eq("user_id", userId)
        .eq("day", day)
        .eq("calls", from)
        .select("calls");
      if (error) throw new Error(`ai_usage update: ${error.code ?? ""} ${error.message}`);
      return (data ?? []).length === 1;
    },

    async drop(userId, day, from) {
      const { data, error } = await admin
        .from("ai_usage")
        .update({ calls: Math.max(0, from - 1) })
        .eq("user_id", userId)
        .eq("day", day)
        .eq("calls", from)
        .select("calls");
      if (error) throw new Error(`ai_usage refund: ${error.code ?? ""} ${error.message}`);
      return (data ?? []).length === 1;
    },
  };
}
