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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, message }: NotificationPayload = await req.json();
    if (!subject || !message) {
      return new Response(JSON.stringify({ error: "Missing subject or message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's notification preferences
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("notify_email, notify_sms, phone_number")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
            html: `<p style="font-family:sans-serif;font-size:15px;color:#222">${message.replace(/\n/g, "<br>")}</p>
                   <p style="font-family:sans-serif;font-size:12px;color:#888;margin-top:24px">
                     You're receiving this because email budget alerts are enabled in your SpendPal settings.<br>
                     <a href="https://spendpal.app/settings">Manage notification preferences</a>
                   </p>`,
          }),
        });
        results.email = emailRes.ok ? "sent" : `failed: ${emailRes.status}`;
      }
    }

    // --- SMS via Twilio ---
    if (profile.notify_sms && profile.phone_number) {
      const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
      const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
      const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");

      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
        results.sms = "skipped: Twilio credentials not configured";
      } else {
        const body = new URLSearchParams({
          To: profile.phone_number,
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
          }
        );
        results.sms = smsRes.ok ? "sent" : `failed: ${smsRes.status}`;
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-notification error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
