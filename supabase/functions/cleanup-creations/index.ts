// cleanup-creations — deletes `creations` objects and rows older than 24 hours.
// Triggered hourly by pg_cron + pg_net (see supabase/migrations/*_cleanup_cron.sql).
//
// Auth: the caller must send the project's secret (service) key — the same value stored in
// Vault as `service_role_key` — in `Authorization: Bearer …` or `apikey`.
// The function reads that key from the function secret CLEANUP_SECRET_KEY (set it to your
// sb_secret_… key), falling back to the auto-injected SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const CLEANUP_KEY = Deno.env.get("CLEANUP_SECRET_KEY");
const LEGACY_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SERVICE_KEY = (CLEANUP_KEY ?? LEGACY_SERVICE_KEY)!;
const ACCEPTED = [CLEANUP_KEY, LEGACY_SERVICE_KEY].filter((k): k is string => !!k);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const apikey = req.headers.get("apikey") ?? "";
  if (!ACCEPTED.some((k) => k === bearer || k === apikey)) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
  let removedObjects = 0;
  let deletedRows = 0;

  // Work in batches of 100 until nothing older than 24 h is left.
  for (let guard = 0; guard < 1000; guard++) {
    const { data: rows, error } = await supabase
      .from("creations")
      .select("id, storage_path")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (error) return json({ error: error.message, removedObjects, deletedRows }, 500);
    if (!rows || rows.length === 0) break;

    // Storage API only — never SQL deletes on storage.objects.
    const paths = rows.map((r) => r.storage_path as string);
    const { data: removed, error: rmErr } = await supabase.storage.from("creations").remove(paths);
    if (rmErr) return json({ error: rmErr.message, removedObjects, deletedRows }, 500);
    removedObjects += removed?.length ?? 0;

    const { error: delErr, count } = await supabase
      .from("creations")
      .delete({ count: "exact" })
      .in("id", rows.map((r) => r.id as string));
    if (delErr) return json({ error: delErr.message, removedObjects, deletedRows }, 500);
    deletedRows += count ?? 0;

    if (rows.length < BATCH) break;
  }

  console.log(
    `cleanup-creations: removed ${removedObjects} objects, deleted ${deletedRows} rows (cutoff ${cutoff})`,
  );
  return json({ ok: true, cutoff, removedObjects, deletedRows });
});
