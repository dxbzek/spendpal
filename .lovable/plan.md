

# Plan: Fix AI Edge Function Auth + Test Performance

## Problem Identified

The edge function `ai-finance` uses `supabase.auth.getClaims(token)` (line 28) which is **not a standard Supabase JS method**. This silently fails, causing all AI requests (budget suggestions, monthly report, AI advisor) to return 401 Unauthorized. The edge function logs only show boot messages -- no actual request processing is logged, confirming requests fail at the auth step.

## Additional Issue: Rent Data

Your rent is AED 1,300 but the transaction shows AED 2,600. You'll need to manually edit that transaction after we fix the AI. (Or let me know if you want me to address it.)

## Fix

### 1. Fix Auth in Edge Function (`supabase/functions/ai-finance/index.ts`)

Replace the `getClaims` call with `supabase.auth.getUser(token)` which is the correct method:

```typescript
// Replace lines 27-33:
const { data: { user }, error: userError } = await supabase.auth.getUser(token);
if (userError || !user) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

This single change should unblock all AI features: dashboard summary, budget suggestions, monthly report, and AI budget advisor.

### 2. No Other Changes Needed

The rest of the AI pipeline (useAI hook, streaming parser, tool calling for budget-advisor) is correctly wired. Once auth is fixed, all features should work.

## Technical Details

- `supabase.auth.getClaims()` does not exist in `@supabase/supabase-js@2` -- it always throws/returns an error, causing every AI request to get a 401 response
- `supabase.auth.getUser(token)` validates the JWT and returns the user object, which is the standard auth verification pattern for edge functions

