"use client";

import { Clock, Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { RecentGrid, type RecentItem } from "@/components/RecentGrid";
import { TabPage } from "@/components/TabBar";
import { Button, Sheet, Spinner, toast } from "@/components/ui";
import { creationUrl, refreshRecent, useRecent } from "@/lib/creations";
import { exportFilename, saveFiles, shareFiles, toJpegFile } from "@/lib/save";

export default function Gallery() {
  const recent = useRecent();
  const [open, setOpen] = useState<RecentItem | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshRecent();
  }, []);

  // Fetch the JPEG when a photo is opened so Share/Save run inside the tap.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the previous file before fetching
    setFile(null);
    fetch(open.url)
      .then((r) => r.blob())
      .then((b) => !cancelled && setFile(toJpegFile(new Blob([b], { type: "image/jpeg" }), exportFilename())))
      .catch(() => !cancelled && toast("Couldn't load this photo"));
    return () => {
      cancelled = true;
    };
  }, [open]);

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

  return (
    <TabPage>
      <header className="pb-1 pt-2">
        <h1 className="text-[28px] font-bold tracking-tight">Gallery</h1>
        <p className="mt-1 flex items-center gap-1.5 text-[14px] text-sub">
          <Clock size={15} strokeWidth={1.8} /> Exports from the last 24 hours. Older photos are deleted automatically.
        </p>
      </header>

      <div className="mt-4">
        <RecentGrid
          items={recent.list.map((c) => ({ id: c.id, url: creationUrl(c), ratio: c.ratio }))}
          loading={!recent.loaded}
          empty="No exports in the last 24 hours."
          onOpen={setOpen}
        />
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} label="Photo">
        {open && (
          <div className="pb-2">
            <div className="flex max-h-[56dvh] items-center justify-center overflow-hidden rounded-[20px] bg-g2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={open.url} alt="Exported photo" className="max-h-[56dvh] w-auto object-contain" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="secondary" disabled={!file || busy} onClick={() => act("share")}>
                {file ? <Share2 size={20} strokeWidth={1.8} /> : <Spinner className="h-4 w-4" />} Share
              </Button>
              <Button disabled={!file || busy} onClick={() => act("save")}>
                <Download size={20} strokeWidth={1.8} /> Save
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </TabPage>
  );
}
