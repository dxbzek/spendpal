import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Always allow all origins. The Authorization header is validated server-side
// so wildcard CORS does not reduce security here.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Auth check ---
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
    // --- End auth check ---

    const body = await req.text();
    // Larger cap for image payloads (base64-encoded screenshots). Text types are
    // still validated against the original 512KB limit below.
    if (body.length > 4_194_304) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, data } = JSON.parse(body);

    const IMAGE_TYPES = new Set(["categorize-image", "categorize-image-budgets", "categorize-image-goals"]);
    if (!IMAGE_TYPES.has(type) && body.length > 512_000) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ALLOWED_TYPES = ["summary", "budget-suggestions", "categorize-csv", "categorize-image", "categorize-image-budgets", "categorize-image-goals", "monthly-report", "budget-advisor"] as const;
    type AllowedType = typeof ALLOWED_TYPES[number];
    if (!ALLOWED_TYPES.includes(type as AllowedType)) {
      return new Response(JSON.stringify({ error: "Invalid request type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: "AI is not available on this server. Please contact support." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = "";
    let userPrompt = "";
    let useToolCalling = false;
    let tools: unknown[] = [];
    let toolChoice: unknown = undefined;

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
      systemPrompt = `You are a bank statement transaction extractor. Extract every purchase/payment transaction and categorize it. Return ONLY a JSON array, no other text.

TWO FORMATS YOU WILL SEE:

FORMAT A — Single line per transaction (common in CSV exports):
  09/02/2026 10/02/2026 APPLE.COM/BILL ITUNES.COM IRL 11.85
  Each line has: transaction-date posting-date description amount

FORMAT B — Multi-column (common in PDF-extracted text, e.g. Emirates NBD):
  Dates appear on their own lines, then merchant names on their own lines, then amounts on their own lines:
  23/03/2026
  24/03/2026
  DIFFANY SUPER HAIR FIXING DUBAI ARE
  OTG LLC DUBAI ARE
  36.75
  2.00
  In this case match them IN ORDER: 1st date→1st merchant→1st amount, 2nd date→2nd merchant→2nd amount, etc.

DATE FORMATS YOU MAY ENCOUNTER — always output as YYYY-MM-DD regardless of input format:
  • DD/MM/YYYY or DD-MM-YYYY          e.g. 23/03/2026, 03-07-2025
  • MM/DD/YYYY                         e.g. 03/23/2026
  • YYYY-MM-DD or YYYY/MM/DD          e.g. 2026-03-23, 2026/03/23
  • DD Mon YYYY or DD-Mon-YYYY        e.g. 23 Mar 2026, 23-Mar-2026
  • Mon DD, YYYY or Month DD YYYY     e.g. Mar 23, 2026, March 23 2026
  • 2-digit year variants             e.g. 23/03/26, 23-Mar-26 → treat as 20XX
  • Date with time (strip the time)   e.g. 23/03/2026 14:30:00 → 2026-03-23
  When ambiguous (e.g. 05/06/2026 could be May 6 or June 5), prefer DD/MM/YYYY order unless other dates in the statement consistently use MM/DD.

RULES:
- Amounts ending in CR (e.g. "2,900.00CR") are income/payments received, type="income"
- All other amounts are expenses, type="expense"
- For foreign currency lines like "11.55 USD / (1 AED = USD 0.26394) / 43.76" use the AED amount (43.76)
- Skip: opening/closing balance lines, "Remaining Principle Balance", statement summary rows, installment plan headers
- Dates: ALWAYS output as YYYY-MM-DD

Categories: Coffee, Groceries, Transport, Dining, Telecom, Metro/Taxi, Travel, Entertainment, Charity, Delivery, DEWA, Rent, Shopping, Health, Education, Subscriptions, Salary, Freelance, Transfer, Other.
Icons: ☕ Coffee, 🛒 Groceries, 🚗 Transport, 🍽️ Dining, 📱 Telecom, 🚇 Metro/Taxi, ✈️ Travel, 🎬 Entertainment, 🤲 Charity, 📦 Delivery, 💡 DEWA, 🏠 Rent, 🛍️ Shopping, 🏥 Health, 📚 Education, 🔄 Subscriptions, 💰 Salary, 💻 Freelance, 🔁 Transfer, 📌 Other.

Return: [{ merchant, amount, date, category, categoryIcon, type }]`;
      userPrompt = `Here is my bank statement:\n${data}`;

    } else if (type === "categorize-image") {
      // Vision-based extraction from a screenshot of a bank statement,
      // transaction list, or similar tabular financial data.
      systemPrompt = `You are a financial screenshot analyzer. Extract every transaction visible in the image and return ONLY a JSON array — no prose, no markdown fences.

WHAT TO LOOK FOR:
- Rows with a date, a merchant/description, and an amount
- Bank statement screenshots, mobile banking app transaction lists, receipts with line items, budget spreadsheets, or plain labelled lists of numbers
- If the screenshot contains a single receipt (one merchant, multiple line items), emit one row per line item using the receipt's store name as the merchant and the store's date
- If no date is visible anywhere in the image, use today's date

DATE HANDLING — always output YYYY-MM-DD:
  • DD/MM/YYYY, DD-MM-YYYY                e.g. 23/03/2026
  • MM/DD/YYYY                             e.g. 03/23/2026
  • YYYY-MM-DD or YYYY/MM/DD              e.g. 2026-03-23
  • DD Mon YYYY, DD-Mon-YYYY              e.g. 23 Mar 2026
  • Mon DD, YYYY or Month DD YYYY         e.g. Mar 23, 2026
  • 2-digit years → treat as 20XX
  • Relative dates ("Today", "Yesterday") → infer from any other dates in the image, or leave as today
  When ambiguous (e.g. 05/06/2026), prefer DD/MM/YYYY unless other dates in the image clearly use MM/DD.

TYPE:
- Amounts shown as income/credit/refund/deposit/salary, or with a + sign, or in green, or tagged CR → type="income"
- Everything else → type="expense"
- Strip currency symbols from the amount (AED, د.إ, $, €, £, ₹) — output a positive number only

SKIP: opening/closing balances, running totals, section headers, "available balance", totals, subtotals, "remaining principal", footer text.

Categories: Coffee, Groceries, Transport, Dining, Telecom, Metro/Taxi, Travel, Entertainment, Charity, Delivery, DEWA, Rent, Shopping, Health, Education, Subscriptions, Salary, Freelance, Transfer, Other.
Icons: ☕ Coffee, 🛒 Groceries, 🚗 Transport, 🍽️ Dining, 📱 Telecom, 🚇 Metro/Taxi, ✈️ Travel, 🎬 Entertainment, 🤲 Charity, 📦 Delivery, 💡 DEWA, 🏠 Rent, 🛍️ Shopping, 🏥 Health, 📚 Education, 🔄 Subscriptions, 💰 Salary, 💻 Freelance, 🔁 Transfer, 📌 Other.

Return: [{ merchant, amount, date, category, categoryIcon, type }]`;
      // userPrompt is unused for this type — content is built below as multimodal.
      userPrompt = "";

    } else if (type === "categorize-image-budgets") {
      // Extract monthly budget allocations from a screenshot (spreadsheet, plan
      // screenshot, labelled list of numbers, envelope planner, etc.)
      systemPrompt = `You are a budget-plan analyzer. Extract every category + monthly budget amount visible in the image and return ONLY a JSON array — no prose, no markdown fences.

WHAT TO LOOK FOR:
- Rows that pair a category/label with an amount (e.g. "Rent 5000", "Groceries — 1,200", "Dining 800 AED/mo")
- Budget spreadsheets, envelope plans, allocation pies, category-named cards with a number
- If the image shows totals and subtotals, emit ONLY the leaf-level categories (skip "Total", "Sum", "Net savings", etc.)

AMOUNT HANDLING:
- Strip currency symbols (AED, د.إ, $, €, £, ₹) and "/mo", "monthly", "per month" suffixes
- Always output a positive number
- If the row is annotated as weekly or yearly, convert to monthly: weekly × 4.33, yearly ÷ 12

CATEGORY MAPPING — prefer these standard names when the label clearly maps:
  Coffee, Groceries, Transport, Dining, Telecom, Metro/Taxi, Travel, Entertainment, Charity, Delivery, DEWA, Rent, Shopping, Health, Education, Subscriptions, Salary, Freelance, Transfer, Utilities, Insurance, Fitness, Personal Care, Gift, Other.
  Otherwise keep the user's original category label verbatim (trimmed).

ICONS — pick one emoji that matches the category:
  ☕ Coffee, 🛒 Groceries, 🚗 Transport, 🍽️ Dining, 📱 Telecom, 🚇 Metro/Taxi, ✈️ Travel, 🎬 Entertainment, 🤲 Charity, 📦 Delivery, 💡 DEWA, 🏠 Rent, 🛍️ Shopping, 🏥 Health, 📚 Education, 🔄 Subscriptions, 💰 Salary, 💻 Freelance, 🔁 Transfer, ⚡ Utilities, 🛡️ Insurance, 🏋️ Fitness, 💇 Personal Care, 🎁 Gift.
  For categories not in the list, pick the single most relevant emoji, or fall back to 📌.

SKIP: header rows, running totals, "Income", "Savings goal" (those go in a separate screen), dashes, empty cells.

Return: [{ category, categoryIcon, amount }]`;
      userPrompt = "";

    } else if (type === "categorize-image-goals") {
      // Extract savings goals from a screenshot (goal list, vision board, spreadsheet).
      systemPrompt = `You are a savings-goal analyzer. Extract every savings goal visible in the image and return ONLY a JSON array — no prose, no markdown fences.

WHAT TO LOOK FOR:
- Rows that pair a goal name with a target amount (e.g. "Emergency fund: 50,000", "New laptop — 6,000 AED", "Vacation 2027 — 15 000 / Dec 2027")
- Ignore current-balance or progress columns unless clearly labelled; the amount you emit is the TARGET, not current saved.

AMOUNT HANDLING:
- Strip currency symbols and punctuation. Output a positive number.
- If the screenshot shows both "target" and "saved" values for the same goal, the target is the larger one (or the one labelled "goal", "target", "needed").

DEADLINE (optional):
- If a due date is visible for a goal, emit as YYYY-MM-DD.
- Accept DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, "Mon YYYY", "YYYY". For "Mon YYYY" use the last day of that month. For a bare year use Dec 31.
- If no date is visible, omit the deadline field.

ICON — one emoji per goal. Good picks:
  🏖️ vacation/travel, 🚗 car, 🏠 home/house, 💍 wedding, 🎓 education, 💻 laptop/tech, 🛡️ emergency fund, 🐾 pet, 👶 baby, 🎁 gift, 🏦 savings, 📈 investment, 🎯 generic goal.

TYPE — one of: emergency, vacation, purchase, wedding, home, education, vehicle, retirement, other.

SKIP: header rows, totals, "net worth", category sums, anything that isn't a goal.

Return: [{ name, icon, type, targetAmount, deadline? }]`;
      userPrompt = "";

    } else if (type === "monthly-report") {
      systemPrompt = `You are a personal finance analyst for a UAE resident. Generate a comprehensive monthly financial report. Structure it with clear sections using markdown-style headers:

## 📊 Monthly Overview
Summarize income, expenses, net savings with percentage changes.

## 🏷️ Top Spending Categories
Rank categories by spending, note any unusual spikes.

## 📋 Budget Performance
Compare actual spending to budgets. Highlight over/under budget categories.

## 🎯 Goal Progress
Summarize progress toward savings goals.

## 💡 Key Insights & Recommendations
3-4 actionable tips based on the data.

Use AED (د.إ) currency. Be specific with numbers. Keep tone professional but friendly.`;
      userPrompt = `Generate my monthly financial report:\n${JSON.stringify(data)}`;

    } else if (type === "budget-advisor") {
      useToolCalling = true;
      systemPrompt = `You are an expert personal finance advisor specializing in budgeting methods. Analyze the user's complete financial picture and provide a comprehensive budget recommendation.

You MUST call the budget_analysis tool with your analysis. Consider:
- Monthly income vs expenses ratio
- Fixed vs variable expense breakdown
- Spending volatility and patterns (weekend overspending, subscription accumulation, lifestyle inflation)
- Savings goals and debt obligations
- Overall financial discipline

Budget methods to consider:
- envelope: Best for users who overspend in flexible categories (dining, shopping). Assigns fixed cash limits per category.
- 50-30-20: Best for users who want simple structure. 50% needs, 30% wants, 20% savings.
- zero-based: Best for users who want strict control over every dollar. Every dollar is assigned a job.
- hybrid: Combines envelope for variable expenses with traditional budgeting for fixed costs.

For the health score (0-100), weigh:
- Savings ratio (25 points): >20% savings = 25pts, >10% = 15pts, >0% = 8pts, negative = 0pts
- Expense stability (25 points): Low variance in monthly spending = more points
- Budget adherence (25 points): How well spending aligns with reasonable limits
- Debt management (25 points): Low credit utilization, no overdue payments

For insights, detect specific patterns like weekend overspending, subscription accumulation, lifestyle inflation, category overspending vs recommended percentages.

For suggested envelopes (if recommending envelope or hybrid), create realistic category budgets based on actual spending patterns.

For simulation, estimate monthly savings potential if the user adopted each budgeting method.`;

      userPrompt = `Analyze my complete financial data and recommend the best budgeting strategy:\n${JSON.stringify(data)}`;

      tools = [
        {
          type: "function",
          function: {
            name: "budget_analysis",
            description: "Return a comprehensive budget analysis with method recommendation, health score, insights, and simulation results.",
            parameters: {
              type: "object",
              properties: {
                recommendedMethod: {
                  type: "string",
                  enum: ["envelope", "50-30-20", "zero-based", "hybrid"],
                  description: "The recommended budgeting method"
                },
                methodReason: {
                  type: "string",
                  description: "2-3 sentence explanation of why this method fits the user's spending behavior"
                },
                healthScore: {
                  type: "number",
                  description: "Budget health score from 0-100"
                },
                healthBreakdown: {
                  type: "object",
                  properties: {
                    savingsRatio: { type: "number", description: "Score out of 25 for savings ratio" },
                    expenseStability: { type: "number", description: "Score out of 25 for expense stability" },
                    budgetAdherence: { type: "number", description: "Score out of 25 for budget adherence" },
                    debtManagement: { type: "number", description: "Score out of 25 for debt management" }
                  },
                  required: ["savingsRatio", "expenseStability", "budgetAdherence", "debtManagement"],
                  additionalProperties: false
                },
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["warning", "positive", "suggestion"], description: "Type of insight" },
                      title: { type: "string", description: "Short title for the insight" },
                      description: { type: "string", description: "1-2 sentence detail" }
                    },
                    required: ["type", "title", "description"],
                    additionalProperties: false
                  },
                  description: "3-6 behavioral insights"
                },
                suggestedEnvelopes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: { type: "string" },
                      icon: { type: "string", description: "Emoji icon for the category" },
                      amount: { type: "number", description: "Suggested monthly budget in user currency" },
                      currentSpending: { type: "number", description: "Current average monthly spending" }
                    },
                    required: ["category", "icon", "amount", "currentSpending"],
                    additionalProperties: false
                  },
                  description: "Suggested budget envelopes"
                },
                simulation: {
                  type: "object",
                  properties: {
                    envelope: { type: "number", description: "Estimated monthly savings with envelope method" },
                    fiftyThirtyTwenty: { type: "number", description: "Estimated monthly savings with 50/30/20" },
                    zeroBased: { type: "number", description: "Estimated monthly savings with zero-based" },
                    hybrid: { type: "number", description: "Estimated monthly savings with hybrid" }
                  },
                  required: ["envelope", "fiftyThirtyTwenty", "zeroBased", "hybrid"],
                  additionalProperties: false
                },
                dynamicAdjustments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      action: { type: "string", description: "Specific actionable adjustment" },
                      impact: { type: "string", description: "Expected monthly savings or improvement" }
                    },
                    required: ["action", "impact"],
                    additionalProperties: false
                  },
                  description: "3-5 specific budget adjustments to make"
                }
              },
              required: ["recommendedMethod", "methodReason", "healthScore", "healthBreakdown", "insights", "suggestedEnvelopes", "simulation", "dynamicAdjustments"],
              additionalProperties: false
            }
          }
        }
      ];
      toolChoice = { type: "function", function: { name: "budget_analysis" } };

    }

    const isImage = IMAGE_TYPES.has(type);

    // Build the user message. For image requests, use OpenAI-compatible
    // multimodal content with a data-URL image_url part.
    let userMessageContent: unknown = userPrompt;
    if (isImage) {
      const { imageDataUrl, imageUrl, hint } =
        (data ?? {}) as { imageDataUrl?: string; imageUrl?: string; hint?: string };
      const url = imageDataUrl ?? imageUrl;
      if (!url || typeof url !== "string") {
        return new Response(JSON.stringify({ error: "Missing image data" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Only accept data URLs (base64 client upload) or https URLs.
      const isDataUrl = url.startsWith("data:image/");
      const isHttpsUrl = url.startsWith("https://");
      if (!isDataUrl && !isHttpsUrl) {
        return new Response(JSON.stringify({ error: "Invalid image URL" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const taskLabel =
        type === "categorize-image-budgets" ? "Extract every budget category and its monthly amount from this screenshot." :
        type === "categorize-image-goals"   ? "Extract every savings goal and its target amount from this screenshot." :
                                              "Extract all transactions from this screenshot.";
      userMessageContent = [
        {
          type: "text",
          text: hint && typeof hint === "string" && hint.length < 500
            ? `${taskLabel} Context from the user: ${hint}`
            : taskLabel,
        },
        { type: "image_url", image_url: { url } },
      ];
    }

    const requestBody: Record<string, unknown> = {
      // Vision requests use Groq's Llama 4 Scout (multimodal). Text requests
      // stay on the text-only 3.3-70B model, which is cheaper and faster.
      model: isImage ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessageContent },
      ],
      stream: type === "summary" || type === "monthly-report",
    };

    if (useToolCalling) {
      requestBody.tools = tools;
      requestBody.tool_choice = toolChoice;
      requestBody.stream = false;
    }

    const groqController = new AbortController();
    const groqTimeout = setTimeout(() => groqController.abort(), 25000);
    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: groqController.signal,
      });
    } catch (fetchErr) {
      clearTimeout(groqTimeout);
      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        return new Response(JSON.stringify({ error: "AI request timed out. Please try again." }), {
          status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw fetchErr;
    }
    clearTimeout(groqTimeout);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI quota exhausted. Please check your Groq API usage limits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "summary" || type === "monthly-report") {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Non-streaming responses
    const result = await response.json();

    // Handle tool calling response for budget-advisor
    if (useToolCalling) {
      const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const analysis = JSON.parse(toolCall.function.arguments);
          return new Response(JSON.stringify({ result: analysis }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (parseError) {
          console.error("Failed to parse tool call arguments:", parseError);
          return new Response(JSON.stringify({ error: "Failed to parse AI analysis" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // Fallback: try to parse from content
      const content = result.choices?.[0]?.message?.content || "";
      return new Response(JSON.stringify({ result: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = result.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-finance error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
