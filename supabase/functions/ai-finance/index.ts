import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
    if (body.length > 512000) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, data } = JSON.parse(body);
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";
    let useToolCalling = false;
    let tools: any[] = [];
    let toolChoice: any = undefined;

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
      systemPrompt = `You are a transaction categorizer. Given bank statement data (CSV, PDF text, or tabular text), categorize each transaction into one of these categories: Coffee, Groceries, Transport, Dining, Telecom, Metro/Taxi, Travel, Entertainment, Charity, Delivery, DEWA, Rent, Shopping, Health, Education, Subscriptions, Salary, Freelance, Transfer, Other.
Also determine if each is an expense or income.
Return a JSON array of objects with: merchant, amount, date (MUST be YYYY-MM-DD format), category, categoryIcon, type (expense/income). Dates MUST always be in YYYY-MM-DD ISO format, never DD/MM/YYYY or MM/DD/YYYY.
Category icons: ☕ Coffee, 🛒 Groceries, 🚗 Transport, 🍽️ Dining, 📱 Telecom, 🚇 Metro/Taxi, ✈️ Travel, 🎬 Entertainment, 🤲 Charity, 📦 Delivery, 💡 DEWA, 🏠 Rent, 🛍️ Shopping, 🏥 Health, 📚 Education, 🔄 Subscriptions, 💰 Salary, 💻 Freelance, 🔁 Transfer, 📌 Other.
Only return the JSON array, no other text.`;
      userPrompt = `Here are my bank statement transactions:\n${data}`;

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

    } else {
      return new Response(JSON.stringify({ error: "Invalid request type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestBody: any = {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: type === "summary" || type === "monthly-report",
    };

    if (useToolCalling) {
      requestBody.tools = tools;
      requestBody.tool_choice = toolChoice;
      requestBody.stream = false;
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

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
