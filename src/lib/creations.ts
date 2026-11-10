import { createStore, useStore } from "./store";
import { dateFolder, publicUrl, supabase, uuid } from "./supabase";
import type { Creation } from "./types";

/** Upload a JPEG to `creations/<yyyy-mm-dd>/<uuid>.jpg` and record it. Auto-deleted after 24 h. */
export async function uploadCreation(
  blob: Blob,
  kind: "original" | "export",
  ratio: string | null,
  templateId: string | null,
): Promise<Creation> {
  if (blob.type !== "image/jpeg") throw new Error("Only JPEG can be stored");
  const sb = supabase();
  const storage_path = `${dateFolder()}/${uuid()}.jpg`;
  const up = await sb.storage
    .from("creations")
    .upload(storage_path, blob, { contentType: "image/jpeg", cacheControl: "86400", upsert: false });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await sb
    .from("creations")
    .insert({ kind, storage_path, ratio, template_id: templateId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const c = data as Creation;
  if (kind === "export") recentStore.set((s) => ({ ...s, list: [c, ...s.list] }));
  return c;
}

export const creationUrl = (c: Creation) => publicUrl("creations", c.storage_path);

interface RecentState {
  list: Creation[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

export const recentStore = createStore<RecentState>({ list: [], loading: false, loaded: false, error: null });
export const useRecent = () => useStore(recentStore);

/** Exports from the last 24 hours. */
export async function refreshRecent() {
  recentStore.set((s) => ({ ...s, loading: true }));
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase()
    .from("creations")
    .select("*")
    .eq("kind", "export")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) {
    recentStore.set((s) => ({ ...s, loading: false, error: error.message }));
    return;
  }
  recentStore.set({ list: (data ?? []) as Creation[], loading: false, loaded: true, error: null });
}

/** Delete one saved export (file + row) through the server route. */
export async function deleteCreation(id: string) {
  const res = await fetch(`/api/creations/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  recentStore.set((s) => ({ ...s, list: s.list.filter((c) => c.id !== id) }));
}

/** Delete several exports; returns how many failed. */
export async function deleteCreations(ids: string[]): Promise<number> {
  const res = await Promise.allSettled(ids.map((id) => deleteCreation(id)));
  return res.filter((r) => r.status === "rejected").length;
}
