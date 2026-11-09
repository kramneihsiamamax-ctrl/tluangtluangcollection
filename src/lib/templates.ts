import { LS } from "./constants";
import { bitmapToJpeg, decodeImage } from "./image";
import { createStore, lsGet, lsSet, useStore } from "./store";
import { publicUrl, supabase, uuid } from "./supabase";
import type { Template } from "./types";

interface TemplatesState {
  list: Template[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

export const templatesStore = createStore<TemplatesState>({ list: [], loading: false, loaded: false, error: null });

let initialised = false;

export const thumbUrl = (t: Template) => publicUrl("templates", t.thumb_path);
export const fullUrl = (t: Template) => publicUrl("templates", t.full_path);

function sortTemplates(list: Template[]) {
  return [...list].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
}

export async function refreshTemplates() {
  templatesStore.set((s) => ({ ...s, loading: true }));
  const { data, error } = await supabase()
    .from("templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    templatesStore.set((s) => ({ ...s, loading: false, error: error.message }));
    return;
  }
  const list = sortTemplates((data ?? []) as Template[]);
  templatesStore.set({ list, loading: false, loaded: true, error: null });
  lsSet(LS.templates, list);
}

export function initTemplates() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  const cached = lsGet<Template[]>(LS.templates);
  if (cached?.length) templatesStore.set({ list: cached, loading: false, loaded: true, error: null });
  void refreshTemplates();
}

export function useTemplates() {
  return useStore(templatesStore);
}

export function getTemplate(id: string | null | undefined): Template | undefined {
  if (!id) return undefined;
  return templatesStore.get().list.find((t) => t.id === id);
}

/** Pick the template to use: the requested one if it exists, otherwise the first one. */
export function resolveTemplateId(id: string | null | undefined): string | null {
  const list = templatesStore.get().list;
  if (id && list.some((t) => t.id === id)) return id;
  return list[0]?.id ?? null;
}

// ---------------------------------------------------------------- full-resolution cache
const fullCache = new Map<string, Promise<ImageBitmap>>();
const MAX_CACHED = 6;

/** Full-resolution template bitmap (fetched once, then cached in memory; the SW caches the bytes). */
export function loadFullTemplate(t: Template): Promise<ImageBitmap> {
  const hit = fullCache.get(t.id);
  if (hit) {
    // refresh LRU position
    fullCache.delete(t.id);
    fullCache.set(t.id, hit);
    return hit;
  }
  const p = fetch(fullUrl(t), { mode: "cors" })
    .then((r) => {
      if (!r.ok) throw new Error(`Template download failed (${r.status})`);
      return r.blob();
    })
    .then((b) => createImageBitmap(b))
    .catch((e) => {
      fullCache.delete(t.id);
      throw e;
    });
  fullCache.set(t.id, p);
  while (fullCache.size > MAX_CACHED) {
    const oldest = fullCache.keys().next().value as string;
    const old = fullCache.get(oldest);
    fullCache.delete(oldest);
    old?.then((b) => b.close()).catch(() => {});
  }
  return p;
}

// ---------------------------------------------------------------- upload / delete
const MAX_TEMPLATE_SIDE = 6000;

/** Convert any image to JPEG (full + 400px thumb) and store it permanently. */
export async function uploadTemplate(file: File): Promise<Template> {
  const bmp = await decodeImage(file);
  try {
    let w = bmp.width;
    let h = bmp.height;
    const long = Math.max(w, h);
    if (long > MAX_TEMPLATE_SIDE) {
      const k = MAX_TEMPLATE_SIDE / long;
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const full = await bitmapToJpeg(bmp, w, h, 0.95);
    const tw = Math.min(400, bmp.width);
    const th = Math.round((bmp.height * tw) / bmp.width);
    const thumb = await bitmapToJpeg(bmp, tw, th, 0.8);

    const id = uuid();
    const full_path = `full/${id}.jpg`;
    const thumb_path = `thumbs/${id}.jpg`;
    const sb = supabase();
    const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
    const a = await sb.storage.from("templates").upload(full_path, full, opts);
    if (a.error) throw new Error(a.error.message);
    const b = await sb.storage.from("templates").upload(thumb_path, thumb, opts);
    if (b.error) throw new Error(b.error.message);

    const maxOrder = templatesStore.get().list.reduce((m, t) => Math.max(m, t.sort_order), 0);
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Uploaded";
    const row = {
      id,
      name,
      full_path,
      thumb_path,
      width: w,
      height: h,
      source: "upload" as const,
      sort_order: maxOrder + 1,
    };
    const { data, error } = await sb.from("templates").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    const t = data as Template;
    templatesStore.set((s) => ({ ...s, list: sortTemplates([...s.list, t]) }));
    lsSet(LS.templates, templatesStore.get().list);
    return t;
  } finally {
    bmp.close();
  }
}

export async function deleteTemplate(t: Template) {
  const sb = supabase();
  // Row first (RLS silently deletes nothing when not allowed, so check what came back),
  // then the files. Storage objects of a deleted row are removed right after.
  const { data, error } = await sb.from("templates").delete().eq("id", t.id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Not allowed to delete this template.");
  const rm = await sb.storage.from("templates").remove([t.full_path, t.thumb_path]);
  if (rm.error) console.warn("template files not removed", rm.error.message);
  fullCache.delete(t.id);
  templatesStore.set((s) => ({ ...s, list: s.list.filter((x) => x.id !== t.id) }));
  lsSet(LS.templates, templatesStore.get().list);
}
