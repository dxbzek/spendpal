import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, data } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "summary") {
      systemPrompt = `You are a personal finance assistant for a UAE resident. Analyze their financial data and write a clear, friendly, 3-4 paragraph monthly summary in plain English. Include:
- Total income vs expenses and net savings
- Top spending categories and notable patterns
- Any concerning trends or positive highlights
- A brief actionable tip
Use AED (د.إ) currency. Keep it concise and conversational.`;
      userPrompt = `Here is my financial data for this month:\n${JSON.stringify(data)}`;
    } else if (type === "budget-suggestions") {
      systemPrompt = `You are a personal finance advisor for a UAE resident. Based on their spending history, suggest optimal monthly budget amounts for each spending category. Be realistic and practical.
Return your response as a JSON array of objects with: category, suggestedAmount, reasoning.
Use AED amounts. Only return the JSON array, no other text.`;
      userPrompt = `Here is my spending data:\n${JSON.stringify(data)}`;
    } else if (type === "categorize-csv") {
      systemPrompt = `You are a transaction categorizer. Given CSV transaction data, categorize each transaction into one of these categories: Coffee, Groceries, Transport, Dining, Telecom, Metro/Taxi, Travel, Entertainment, Charity, Delivery, DEWA, Rent, Shopping, Health, Education, Subscriptions, Salary, Freelance, Transfer, Other.
Also determine if each is an expense or income.
Return a JSON array of objects with: merchant, amount, date, category, categoryIcon, type (expense/income).
Category icons: ☕ Coffee, 🛒 Groceries, 🚗 Transport, 🍽️ Dining, 📱 Telecom, 🚇 Metro/Taxi, ✈️ Travel, 🎬 Entertainment, 🤲 Charity, 📦 Delivery, 💡 DEWA, 🏠 Rent, 🛍️ Shopping, 🏥 Health, 📚 Education, 🔄 Subscriptions, 💰 Salary, 💻 Freelance, 🔁 Transfer, 📌 Other.
Only return the JSON array, no other text.`;
      userPrompt = `Here are my bank statement transactions:\n${data}`;
    } else {
      throw new Error("Unknown type: " + type);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: type === "summary",
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in your Lovable workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "summary") {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Non-streaming responses
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-finance error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
