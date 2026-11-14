import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";

// Deletes the signed-in user's account: POST with the user's JWT, no body.
//
// Order matters. The avatar files go first, because once the login is gone
// nobody can remove them and the bucket is public. Then the auth user is
// deleted; every table references auth.users ON DELETE CASCADE, so all the
// user's rows go with it.
//
// The user id comes from the verified token only. Nothing in the request can
// name a different account.

const AVATAR_BUCKET = "avatars";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json(401, { error: "Unauthorized" });

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("delete-account: SUPABASE_SERVICE_ROLE_KEY is not set");
      return json(503, { error: "Account deletion is unavailable. Please try again later." });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Remove avatars/<uid>/*. The app keeps one file there. Subfolders are
    //    emptied too: the upload rule allows any path under the user's folder,
    //    so a file put there through the API must not be left behind.
    const bucket = admin.storage.from(AVATAR_BUCKET);
    const emptyFolder = async (folder: string, depth: number): Promise<void> => {
      for (let round = 0; round < 20; round++) {
        const { data: entries, error: listError } = await bucket.list(folder, { limit: 100 });
        if (listError) throw new Error(`avatar list failed: ${listError.message}`);
        // An entry with no id is a subfolder.
        const files = (entries ?? []).filter((e) => e.id).map((e) => `${folder}/${e.name}`);
        const folders = (entries ?? []).filter((e) => !e.id).map((e) => `${folder}/${e.name}`);
        if (depth < 5) for (const sub of folders) await emptyFolder(sub, depth + 1);
        if (files.length === 0) return;
        const { error: removeError } = await bucket.remove(files);
        if (removeError) throw new Error(`avatar remove failed: ${removeError.message}`);
      }
    };
    await emptyFolder(user.id, 0);

    // 2. Delete the login. The database cascades to every table.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(`deleteUser failed: ${deleteError.message}`);

    return json(200, { ok: true });
  } catch (e) {
    // Nothing is half-done in a way that blocks a retry: files already removed
    // stay removed, and the account still exists, so the user can try again.
    console.error("delete-account error:", e);
    return json(500, { error: "The account could not be deleted. Please try again." });
  }
});
