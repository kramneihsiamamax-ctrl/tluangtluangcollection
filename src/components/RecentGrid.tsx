"use client";

import { Check, ImageOff } from "lucide-react";
import { cx } from "./ui";

export interface RecentItem {
  id: string;
  url: string;
  ratio: string | null;
}

/** 3-column grid of exports with fixed square boxes (no layout shift). Pass `selected` for select mode. */
export function RecentGrid({
  items,
  loading,
  empty,
  onOpen,
  selected,
}: {
  items: RecentItem[];
  loading: boolean;
  empty: string;
  onOpen?: (item: RecentItem) => void;
  selected?: Set<string>;
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
      {items.map((it) => {
        const on = selected?.has(it.id) ?? false;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onOpen?.(it)}
            className={cx(
              "press relative aspect-square overflow-hidden rounded-2xl border bg-g2",
              on ? "border-2 border-ink" : "border-line",
            )}
            aria-label={selected ? (on ? "Selected photo" : "Select photo") : "Open photo"}
            aria-pressed={selected ? on : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.url}
              alt=""
              loading="lazy"
              decoding="async"
              className={cx("h-full w-full object-cover", on && "opacity-80")}
            />
            {selected && (
              <span
                className={cx(
                  "absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2",
                  on ? "border-ink bg-ink text-white" : "border-white bg-black/20",
                )}
              >
                {on && <Check size={14} strokeWidth={3} />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
