"use client";

import { Clock, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PhotoSheet } from "@/components/PhotoSheet";
import { RecentGrid, type RecentItem } from "@/components/RecentGrid";
import { TabPage } from "@/components/TabBar";
import { Button, Sheet, Spinner, toast } from "@/components/ui";
import { creationUrl, deleteCreations, refreshRecent, useRecent } from "@/lib/creations";

const RED = "#c62828";

export default function Gallery() {
  const recent = useRecent();
  const [open, setOpen] = useState<RecentItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Select mode (delete several at once).
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  useEffect(() => {
    void refreshRecent();
  }, []);

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
    setConfirmBulk(false);
  };

  const toggle = (it: RecentItem) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(it.id)) n.delete(it.id);
      else n.add(it.id);
      return n;
    });

  const removeSelected = async () => {
    setDeleting(true);
    const n = selected.size;
    const failed = await deleteCreations([...selected]);
    setDeleting(false);
    toast(failed ? `${n - failed} deleted, ${failed} failed` : n === 1 ? "Photo deleted" : `${n} photos deleted`);
    exitSelect();
  };

  const items = recent.list.map((c) => ({ id: c.id, url: creationUrl(c), ratio: c.ratio }));

  return (
    <TabPage>
      <header className="sticky top-0 z-10 -mx-4 bg-app/95 px-4 pb-2 pt-2 backdrop-blur">
        {selecting ? (
          <div className="flex h-[42px] items-center justify-between gap-2">
            <button type="button" onClick={exitSelect} className="press h-11 px-1 text-[15px] font-semibold">
              Cancel
            </button>
            <span className="text-[15px] font-semibold">{selected.size} selected</span>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => setConfirmBulk(true)}
              className="press flex h-11 items-center gap-1.5 rounded-[14px] px-4 text-[15px] font-semibold text-white disabled:opacity-40"
              style={{ background: RED }}
            >
              <Trash2 size={18} strokeWidth={1.8} /> Delete
            </button>
          </div>
        ) : (
          <div className="flex h-[42px] items-center justify-between">
            <h1 className="text-[28px] font-bold tracking-tight">Gallery</h1>
            {!!items.length && (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="press h-11 rounded-[14px] border border-line bg-white px-4 text-[15px] font-semibold"
              >
                Select
              </button>
            )}
          </div>
        )}
      </header>
      <p className="flex items-center gap-1.5 text-[14px] text-sub">
        <Clock size={15} strokeWidth={1.8} className="shrink-0" /> Exports from the last 24 hours. Older photos are
        deleted automatically.
      </p>

      <div className="mt-4">
        <RecentGrid
          items={items}
          loading={!recent.loaded}
          empty="No exports in the last 24 hours."
          onOpen={selecting ? toggle : setOpen}
          selected={selecting ? selected : undefined}
        />
      </div>

      <PhotoSheet item={open} onClose={() => setOpen(null)} />

      {/* Several photos */}
      <Sheet open={confirmBulk} onClose={() => setConfirmBulk(false)} label="Delete photos">
        <div className="pb-3">
          <h2 className="text-[20px] font-bold">
            Delete {selected.size} {selected.size === 1 ? "photo" : "photos"}?
          </h2>
          <p className="mt-1 text-[14px] text-sub">This can&apos;t be undone.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setConfirmBulk(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button onClick={removeSelected} disabled={deleting} style={{ background: RED }}>
              {deleting ? <Spinner light className="h-4 w-4" /> : <Trash2 size={18} strokeWidth={1.8} />} Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </TabPage>
  );
}
