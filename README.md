# SpendPal

A personal finance management PWA for tracking accounts, transactions, budgets, and savings goals — with an AI advisor powered by Groq.

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn-ui
- Supabase (PostgreSQL + Auth + Edge Functions)
- Groq API (AI Advisor)

## Local development

Requires Node.js and npm.

```sh
# Clone the repo
git clone <YOUR_GIT_URL>
cd spendpal

# Install dependencies
npm install

# Start the dev server
npm run dev
```

## Environment variables

The AI Advisor edge function requires a `GROQ_API_KEY` set in your Supabase project secrets:

```sh
supabase secrets set GROQ_API_KEY=<your_key>
```

Get a free API key at [console.groq.com](https://console.groq.com).

## Deployment

Deploy the frontend to any static host (Vercel, Netlify, etc.) and deploy Supabase edge functions with:

```sh
supabase functions deploy ai-finance
```
