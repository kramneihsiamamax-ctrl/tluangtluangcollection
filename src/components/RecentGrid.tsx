"use client";

import { ImageOff } from "lucide-react";

export interface RecentItem {
  id: string;
  url: string;
  ratio: string | null;
}

/** 3-column grid of exports with fixed square boxes (no layout shift). */
export function RecentGrid({
  items,
  loading,
  empty,
  onOpen,
}: {
  items: RecentItem[];
  loading: boolean;
  empty: string;
  onOpen?: (item: RecentItem) => void;
}) {
  if (loading && !items.length) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shimmer relative aspect-square overflow-hidden rounded-2xl bg-g2" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="flex flex-col items-center rounded-[22px] border border-dashed border-g4 bg-white px-6 py-8 text-center">
        <ImageOff size={24} strokeWidth={1.8} className="text-icon" />
        <p className="mt-2 text-[14px] text-sub">{empty}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onOpen?.(it)}
          className="press relative aspect-square overflow-hidden rounded-2xl border border-line bg-g2"
          aria-label="Open photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}
