import { createClient } from "@supabase/supabase-js";

/**
 * DELETE /api/creations/:id — removes one saved export (file + row).
 * Runs on the Cloudflare Worker with the secret key, so the database keeps
 * NO anon delete policy on `creations`.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "Server is missing Supabase settings" }, { status: 500 });

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: row, error } = await sb.from("creations").select("id, storage_path").eq("id", id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!row) return Response.json({ ok: true, gone: true });

  const rm = await sb.storage.from("creations").remove([row.storage_path]);
  if (rm.error) return Response.json({ error: rm.error.message }, { status: 500 });
  const del = await sb.from("creations").delete().eq("id", id);
  if (del.error) return Response.json({ error: del.error.message }, { status: 500 });
  return Response.json({ ok: true });
}
