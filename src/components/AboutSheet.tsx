"use client";

import { Sheet } from "./ui";

export function AboutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="About">
      <div className="max-h-[80dvh] overflow-y-auto pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-full.jpg"
          alt="TluangTluang Collection — readymade garments, Dawrpui, Aizawl"
          width={1254}
          height={1254}
          className="mx-auto h-auto w-full max-w-[360px] rounded-[22px] border border-line"
        />
        <h2 className="mt-4 text-center text-[20px] font-bold">TluangTluang Collection</h2>
        <p className="mt-1 text-center text-[14px] text-sub">Readymade garments · Wholesale &amp; retail · Dawrpui, Aizawl</p>
        <p className="mt-4 text-center text-[12px] text-sub">
          Product Photo Studio. Background removal runs on this device (IMG.LY, AGPL-3.0).
        </p>
        <button
          type="button"
          onClick={onClose}
          className="press mt-4 h-14 w-full rounded-2xl border border-line text-[16px] font-semibold"
        >
          Close
        </button>
      </div>
    </Sheet>
  );
}
