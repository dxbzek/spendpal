import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { EMAIL_PER_DAY, buildBudgetAlert, isAlertThreshold, isUuid } from "../_shared/budgetAlert.ts";

// Sends one budget alert email to the signed-in user.
//
// The caller sends { budget_id, threshold } and nothing else. The subject and
// the body are built here from the caller's own budget row, so this function
// cannot be used to send someone else's text from the product's address.
//
// SMS is not offered: there is no way to verify a phone number yet, and the
// "verified" flag on the profile is writable by the user.
//
// Secrets: RESEND_API_KEY and ALERT_FROM_EMAIL (a sender on a domain verified
// with Resend, e.g. "SpendPal <alerts@example.com>"). Without both, nothing is
// sent. SITE_URL is optional and defaults to the live site.

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req.headers.get("Origin"), Deno.env.get("ALLOWED_ORIGINS"));
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    // Reads run as the user, so row level security limits them to the caller's own rows.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json(401, { error: "Unauthorized" });

    let payload: { budget_id?: unknown; threshold?: unknown };
    try {
      payload = await req.json();
    } catch {
      return json(400, { error: "Invalid request body" });
    }
    const { budget_id, threshold } = payload ?? {};
    if (!isUuid(budget_id) || !isAlertThreshold(threshold)) {
      return json(400, { error: "Expected budget_id and a threshold of 75, 90 or 100" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("notify_email, currency")
      .eq("user_id", user.id)
      .single();
    if (profileError || !profile) return json(404, { error: "Profile not found" });

    if (!profile.notify_email || !user.email) {
      return json(200, { ok: true, results: { email: "skipped: email alerts are off" } });
    }

    const { data: budget, error: budgetError } = await supabase
      .from("budgets")
      .select("category, amount")
      .eq("id", budget_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (budgetError) throw budgetError;
    if (!budget) return json(404, { error: "Budget not found" });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const ALERT_FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL");
    if (!RESEND_API_KEY || !ALERT_FROM_EMAIL) {
      return json(200, { ok: true, results: { email: "skipped: email sender is not configured" } });
    }

    // Per-user limit. The log is written with the service role, so a user
    // cannot delete rows to reset their own count.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json(503, { error: "Email alerts are unavailable" });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Write the log row first, then count. Two requests at the same moment
    // each see the other's row, so together they cannot pass the limit.
    const { error: logError } = await admin
      .from("notification_log")
      .insert({ user_id: user.id, channel: "email" });
    if (logError) {
      console.error("notification_log insert failed; email not sent:", logError);
      return json(503, { error: "Email alerts are unavailable" });
    }
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("notification_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id).eq("channel", "email").gte("created_at", since24h);
    if (countError || count === null) {
      console.error("notification_log count failed; email not sent:", countError);
      return json(503, { error: "Email alerts are unavailable" });
    }
    if (count > EMAIL_PER_DAY) return json(429, { error: "Email alert limit reached for today" });

    const email = buildBudgetAlert({
      category: budget.category,
      amount: Number(budget.amount),
      currency: profile.currency,
      threshold,
      siteUrl: Deno.env.get("SITE_URL"),
    });

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ALERT_FROM_EMAIL,
        to: [user.email],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    if (!emailRes.ok) console.error("Resend refused the email:", emailRes.status, await emailRes.text());

    return json(200, { ok: true, results: { email: emailRes.ok ? "sent" : `failed: ${emailRes.status}` } });
  } catch (e) {
    console.error("send-notification error:", e);
    return json(500, { error: "Internal error" });
  }
});
