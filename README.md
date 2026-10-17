# SpendPal

A personal finance management PWA for tracking accounts, transactions, budgets, and savings goals — with an AI advisor powered by Claude.

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn-ui
- Supabase (PostgreSQL + Auth + Edge Functions)
- Anthropic Claude API (AI features)

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

The `ai-finance` edge function (advisor, budget suggestions, statement and screenshot import) requires an `ANTHROPIC_API_KEY` in your Supabase project secrets:

```sh
supabase secrets set ANTHROPIC_API_KEY=<your_key>
supabase functions deploy ai-finance
```

Create a key at [platform.claude.com](https://platform.claude.com).

## Deployment

Deploy the frontend to any static host (Vercel, Netlify, etc.) and deploy Supabase edge functions with:

```sh
supabase functions deploy ai-finance
```
