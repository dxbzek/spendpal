#!/usr/bin/env node
/**
 * Admin script: update a user's email directly in Supabase auth
 * Uses the service-role key — no confirmation email is sent.
 *
 * Usage:
 *   node scripts/update-user-email.mjs <old-email-or-user-id> <new-email>
 *
 * Requires these env vars (create a .env.admin file or export them):
 *   SUPABASE_URL            — e.g. https://uwvlhdkxhvcxccutaoew.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — found in Supabase Dashboard → Settings → API
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── Load .env.admin if it exists ────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.admin');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Tip: create a .env.admin file (it is git-ignored) with those two values.');
  process.exit(1);
}

const [, , identifier, newEmail] = process.argv;

if (!identifier || !newEmail) {
  console.error('Usage: node scripts/update-user-email.mjs <old-email-or-user-id> <new-email>');
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
  console.error('Invalid new email address:', newEmail);
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function resolveUserId(identifier) {
  // If it looks like a UUID, use it directly
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
    return identifier;
  }
  // Otherwise treat it as an email and look up the user
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const match = data.users.find(u => u.email === identifier);
  if (!match) throw new Error(`No user found with email: ${identifier}`);
  return match.id;
}

async function main() {
  console.log(`Resolving user: ${identifier} …`);
  const userId = await resolveUserId(identifier);
  console.log(`Found user ID: ${userId}`);
  console.log(`Updating email → ${newEmail} …`);

  const { data, error } = await admin.auth.admin.updateUserById(userId, { email: newEmail });
  if (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }

  console.log(`Done. Email updated to: ${data.user.email}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
