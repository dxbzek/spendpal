import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  subject: string;
  message: string;
}

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 2000;
const PHONE_RE = /^\+[1-9]\d{6,14}$/;
// Per-user SMS rate limits (toll-fraud mitigation).
const SMS_PER_HOUR = 5;
const SMS_PER_DAY = 20;
// Best-effort premium-rate / revenue-share prefixes to refuse. Conservative on
// purpose to avoid blocking legitimate numbers; the verified-phone requirement
// and rate limiting are the primary defenses.
const PREMIUM_PREFIXES = ["+1900", "+1976", "+449"];

// HTML-escape any value interpolated into the email body.
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    // Service-role client for tamper-proof rate-limit logging (bypasses RLS).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json(401, { error: "Unauthorized" });

    const { subject, message }: NotificationPayload = await req.json();
    if (!subject || !message) return json(400, { error: "Missing subject or message" });
    if (subject.length > MAX_SUBJECT) return json(400, { error: "Subject too long" });
    if (message.length > MAX_MESSAGE) return json(400, { error: "Message too long" });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("notify_email, notify_sms, phone_number, phone_verified_at")
      .eq("user_id", user.id)
      .single();
    if (profileError || !profile) return json(404, { error: "Profile not found" });

    const results: { email?: string; sms?: string } = {};

    // --- Email via Resend ---
    if (profile.notify_email && user.email) {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) {
        results.email = "skipped: RESEND_API_KEY not configured";
      } else {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "SpendPal <alerts@spendpal.app>",
            to: [user.email],
            subject,
            html: `<p style="font-family:sans-serif;font-size:15px;color:#222">${esc(message).replace(/\n/g, "<br>")}</p>
                   <p style="font-family:sans-serif;font-size:12px;color:#888;margin-top:24px">
                     You're receiving this because email budget alerts are enabled in your SpendPal settings.<br>
                     <a href="https://spendpal.app/settings">Manage notification preferences</a>
                   </p>`,
          }),
        });
        results.email = emailRes.ok ? "sent" : `failed: ${emailRes.status}`;
        if (emailRes.ok) {
          await admin.from("notification_log").insert({ user_id: user.id, channel: "email" });
        }
      }
    }

    // --- SMS via Twilio ---
    if (profile.notify_sms && profile.phone_number) {
      const phone = profile.phone_number as string;

      // 1. Require a verified phone before any SMS can be sent.
      if (!profile.phone_verified_at) {
        return json(403, { error: "Phone number is not verified" });
      }
      // 2. Server-side format + premium-rate validation (defense in depth;
      //    the DB also enforces E.164).
      if (!PHONE_RE.test(phone) || PREMIUM_PREFIXES.some((p) => phone.startsWith(p))) {
        return json(400, { error: "Phone number is not allowed" });
      }
      // 3. Per-user rate limiting.
      const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: hourCount } = await admin
        .from("notification_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("channel", "sms").gte("created_at", since1h);
      const { count: dayCount } = await admin
        .from("notification_log")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("channel", "sms").gte("created_at", since24h);
      if ((hourCount ?? 0) >= SMS_PER_HOUR || (dayCount ?? 0) >= SMS_PER_DAY) {
        return json(429, { error: "SMS rate limit exceeded" });
      }

      const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
      const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
      const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");

      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
        results.sms = "skipped: Twilio credentials not configured";
      } else {
        const body = new URLSearchParams({
          To: phone,
          From: TWILIO_FROM_NUMBER,
          Body: `SpendPal: ${message}`,
        });
        const smsRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
          },
        );
        results.sms = smsRes.ok ? "sent" : `failed: ${smsRes.status}`;
        if (smsRes.ok) {
          await admin.from("notification_log").insert({ user_id: user.id, channel: "sms" });
        }
      }
    }

    return json(200, { ok: true, results });
  } catch (e) {
    console.error("send-notification error:", e);
    return json(500, { error: "Internal error" });
  }
});
