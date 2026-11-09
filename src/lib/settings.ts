import { DEFAULT_SETTINGS, LS } from "./constants";
import { createStore, lsGet, lsSet, useStore } from "./store";
import { supabase } from "./supabase";
import type { AppSettings, WatermarkSettings } from "./types";

/** Settings: localStorage cache for instant start, Supabase `settings` row (id = 1) as the source of truth. */
export const settingsStore = createStore<AppSettings>(DEFAULT_SETTINGS);

let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function normalize(raw: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    watermark: { ...DEFAULT_SETTINGS.watermark, ...(raw?.watermark ?? {}) },
    defaultTemplateId: raw?.defaultTemplateId ?? null,
  };
}

export function initSettings() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const cached = lsGet<AppSettings>(LS.settings);
  if (cached) settingsStore.set(normalize(cached));

  supabase()
    .from("settings")
    .select("watermark, default_template_id")
    .eq("id", 1)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error || !data) return;
      // Don't clobber a change the user made while we were loading.
      if (saveTimer) return;
      const next = normalize({
        watermark: data.watermark as Partial<WatermarkSettings> as WatermarkSettings,
        defaultTemplateId: data.default_template_id,
      });
      settingsStore.set(next);
      lsSet(LS.settings, next);
    });
}

function persist() {
  const s = settingsStore.get();
  lsSet(LS.settings, s);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const cur = settingsStore.get();
    void supabase()
      .from("settings")
      .update({ watermark: cur.watermark, default_template_id: cur.defaultTemplateId })
      .eq("id", 1)
      .then(({ error }) => {
        if (error) console.warn("settings save failed", error.message);
      });
  }, 600);
}

export function updateWatermark(patch: Partial<WatermarkSettings>) {
  settingsStore.set((s) => ({ ...s, watermark: { ...s.watermark, ...patch } }));
  persist();
}

export function setDefaultTemplate(id: string | null) {
  if (settingsStore.get().defaultTemplateId === id) return;
  settingsStore.set((s) => ({ ...s, defaultTemplateId: id }));
  persist();
}

export function useSettings() {
  return useStore(settingsStore, DEFAULT_SETTINGS);
}
