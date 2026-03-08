

## Analysis

**Data isolation**: Already implemented correctly. Every table (accounts, transactions, budgets, goals, profiles) has a `user_id` column with RLS policies ensuring `auth.uid() = user_id`. Different email accounts already get completely separate data.

**Google sign-in**: Lovable Cloud has managed Google OAuth built in -- no API keys needed.

## Plan

### 1. Add Google Sign-In to AuthPage
- Use the Configure Social Login tool to generate the `lovable` module for Google OAuth
- Import `lovable` from `@/integrations/lovable/index` in `AuthPage.tsx`
- Add a "Sign in with Google" button that calls `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`
- Style it consistently with the existing auth form (Google logo, full-width button, separator "or")

### 2. Confirm Data Isolation (No code changes needed)
- All tables already have proper RLS policies scoped to `auth.uid() = user_id`
- The `FinanceContext` fetches data filtered by the authenticated user's session
- Will confirm this to the user -- each email/Google account gets its own isolated financial data

### Technical Details
- Google OAuth is managed by Lovable Cloud automatically -- no client ID or secret configuration required
- The `@lovable.dev/cloud-auth-js` package will be installed via the Configure Social Login tool
- After Google sign-in, the existing `onAuthStateChange` listener in `AuthContext` picks up the session seamlessly
- The `handle_new_user` trigger already creates a profile row for new signups (including OAuth)

