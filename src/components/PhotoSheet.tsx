"use client";

import { Download, Share2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteCreation } from "@/lib/creations";
import { exportFilename, saveFiles, shareFiles, toJpegFile } from "@/lib/save";
import type { RecentItem } from "./RecentGrid";
import { Button, Sheet, Spinner, toast } from "./ui";

const RED = "#c62828";

/** Bottom sheet for one saved export: preview + Delete / Share / Save. */
export function PhotoSheet({ item, onClose }: { item: RecentItem | null; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch the JPEG when a photo is opened so Share/Save run inside the tap.
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the previous file before fetching
    setFile(null);
    setConfirmDel(false);
    fetch(item.url)
      .then((r) => r.blob())
      .then((b) => !cancelled && setFile(toJpegFile(new Blob([b], { type: "image/jpeg" }), exportFilename())))
      .catch(() => !cancelled && toast("Couldn't load this photo"));
    return () => {
      cancelled = true;
    };
  }, [item]);

  const act = async (mode: "share" | "save") => {
    if (!file) return;
    setBusy(true);
    try {
      const res = mode === "share" ? await shareFiles([file]) : await saveFiles([file]);
      if (res === "downloaded") toast("Saved to Downloads");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      await deleteCreation(item.id);
      toast("Photo deleted");
      onClose();
    } catch (err) {
      toast(`Delete failed: ${(err as Error).message}`);
    } finally {
      setDeleting(false);
      setConfirmDel(false);
    }
  };

  return (
    <Sheet open={!!item} onClose={onClose} label="Photo">
      {item && (
        <div className="pb-3">
          <div className="flex max-h-[48dvh] items-center justify-center overflow-hidden rounded-[20px] bg-g2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt="Exported photo" className="max-h-[48dvh] w-auto object-contain" />
          </div>
          {confirmDel ? (
            <div className="mt-4">
              <p className="mb-3 text-center text-[15px] font-semibold">Delete this photo?</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => setConfirmDel(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button onClick={remove} disabled={deleting} style={{ background: RED }}>
                  {deleting ? <Spinner light className="h-4 w-4" /> : <Trash2 size={18} strokeWidth={1.8} />} Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-[56px_1fr_1fr] gap-2">
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                aria-label="Delete photo"
                className="press flex h-14 items-center justify-center rounded-2xl border bg-white"
                style={{ borderColor: RED, color: RED }}
              >
                <Trash2 size={20} strokeWidth={1.8} />
              </button>
              <Button variant="secondary" className="px-3" disabled={!file || busy} onClick={() => act("share")}>
                {file ? <Share2 size={20} strokeWidth={1.8} /> : <Spinner className="h-4 w-4" />} Share
              </Button>
              <Button className="px-3" disabled={!file || busy} onClick={() => act("save")}>
                <Download size={20} strokeWidth={1.8} /> Save
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
