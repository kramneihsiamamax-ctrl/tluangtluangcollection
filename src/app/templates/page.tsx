"use client";

import { Check, Plus, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { TabPage } from "@/components/TabBar";
import { Button, Pill, Sheet, Spinner, cx, toast } from "@/components/ui";
import { setDefaultTemplate, useSettings } from "@/lib/settings";
import { deleteTemplate, thumbUrl, uploadTemplate, useTemplates } from "@/lib/templates";
import type { Template } from "@/lib/types";

const LONG_PRESS_MS = 550;

export default function TemplatesScreen() {
  const { list, loaded, error } = useTemplates();
  const settings = useSettings();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "upload">("all");
  const [uploading, setUploading] = useState(0);
  const [toDelete, setToDelete] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter(
      (t) => (filter === "all" || t.source === "upload") && (!q || (t.name ?? "").toLowerCase().includes(q)),
    );
  }, [list, query, filter]);

  const selectedId = settings.defaultTemplateId ?? list[0]?.id;

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(files.length);
    let ok = 0;
    for (const f of files) {
      try {
        await uploadTemplate(f);
        ok++;
      } catch (err) {
        toast(`Upload failed: ${(err as Error).message}`);
      }
      setUploading((n) => n - 1);
    }
    if (ok) toast(ok === 1 ? "Template uploaded" : `${ok} templates uploaded`);
  };

  const startPress = (t: Template) => {
    press.current.fired = false;
    press.current.timer = setTimeout(() => {
      press.current.fired = true;
      navigator.vibrate?.(10);
      setToDelete(t);
    }, LONG_PRESS_MS);
  };
  const endPress = () => {
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = null;
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteTemplate(toDelete);
      if (settings.defaultTemplateId === toDelete.id) setDefaultTemplate(null);
      toast("Template deleted");
      setToDelete(null);
    } catch (err) {
      toast(`Delete failed: ${(err as Error).message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TabPage>
      <header className="flex items-center justify-between pb-3 pt-2">
        <h1 className="text-[28px] font-bold tracking-tight">Templates</h1>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="press flex h-11 items-center gap-1.5 rounded-[14px] bg-ink px-4 text-[15px] font-semibold text-white"
        >
          {uploading ? <Spinner light className="h-4 w-4" /> : <Upload size={18} strokeWidth={1.8} />} Upload
        </button>
      </header>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={onFiles}
        data-testid="template-input"
      />

      <label className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-white px-4">
        <Search size={18} strokeWidth={1.8} className="text-icon" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates"
          className="h-full w-full bg-transparent text-[16px] outline-none placeholder:text-sub"
          aria-label="Search templates"
        />
      </label>

      <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Filter">
        <Pill active={filter === "all"} onClick={() => setFilter("all")} role="radio" aria-checked={filter === "all"}>
          All
        </Pill>
        <Pill
          active={filter === "upload"}
          onClick={() => setFilter("upload")}
          role="radio"
          aria-checked={filter === "upload"}
        >
          Uploaded
        </Pill>
        <span className="ml-auto self-center text-[13px] text-sub">{loaded ? `${shown.length} shown` : ""}</span>
      </div>

      {error && !list.length && <p className="mt-4 text-[14px] text-sub">Couldn&apos;t load templates: {error}</p>}

      <p className="mt-3 text-[13px] text-sub">Tap to set as default · Long-press to delete</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="press flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-g5 bg-white text-[13px] font-semibold text-sub"
        >
          {uploading ? <Spinner /> : <Plus size={24} strokeWidth={1.8} />}
          {uploading ? `Uploading ${uploading}` : "Add"}
        </button>

        {!loaded &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="shimmer relative aspect-[3/4] overflow-hidden rounded-2xl bg-g2" />
          ))}

        {shown.map((t) => {
          const sel = t.id === selectedId;
          return (
            <button
              key={t.id}
              type="button"
              onPointerDown={() => startPress(t)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                if (press.current.fired) return;
                setDefaultTemplate(t.id);
                toast(`${t.name ?? "Template"} set as default`);
              }}
              aria-label={`${t.name ?? "Template"} (long-press to delete)`}
              aria-pressed={sel}
              className={cx(
                "press relative aspect-[3/4] overflow-hidden rounded-2xl border-2 bg-g2",
                sel ? "border-ink" : "border-transparent",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbUrl(t)}
                alt=""
                loading="lazy"
                decoding="async"
                width={400}
                height={533}
                className="absolute inset-0 h-full w-full object-cover"
              />
              {sel && (
                <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
              {t.source === "upload" && (
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                  Uploaded
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loaded && filter === "upload" && !shown.length && (
        <p className="mt-6 text-center text-[14px] text-sub">No uploaded templates yet. Tap Upload to add your own.</p>
      )}

      <Sheet open={!!toDelete} onClose={() => setToDelete(null)} label="Delete template">
        <div className="pb-2">
          <h2 className="text-[20px] font-bold">Delete template?</h2>
          <p className="mt-1 text-[14px] text-sub">
            “{toDelete?.name}” will be removed for everyone. This can&apos;t be undone.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Spinner light className="h-4 w-4" /> : <Trash2 size={18} strokeWidth={1.8} />} Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </TabPage>
  );
}
