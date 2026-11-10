"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { createStore, useStore } from "@/lib/store";

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
export { cx };

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary"; block?: boolean };

export function Button({ variant = "primary", block, className, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "press inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-6 text-[16px] font-semibold disabled:opacity-40",
        variant === "primary" ? "bg-ink text-white" : "border border-line bg-white text-ink",
        block && "w-full",
        className,
      )}
    />
  );
}

export function IconButton({ className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "press inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-white text-ink",
        className,
      )}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-11 w-[58px] shrink-0 items-center"
    >
      <span
        className={cx(
          "absolute inset-x-0 top-1/2 h-[30px] -translate-y-1/2 rounded-full transition-colors duration-150",
          checked ? "bg-ink" : "bg-g4",
        )}
      />
      <span
        className="absolute left-[3px] top-1/2 h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-150"
        style={{ transform: `translate3d(${checked ? 28 : 0}px, -50%, 0)` }}
      />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[14px] bg-g2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] text-[14px] font-semibold",
            o.value === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-sub",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({
  active,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={cx(
        "press h-9 shrink-0 rounded-xl px-3.5 text-[13px] font-semibold",
        active ? "bg-ink text-white" : "border border-line bg-white text-sub",
        className,
      )}
    />
  );
}

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("rounded-[22px] border border-line bg-white", className)} />;
}

export function Spinner({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block h-5 w-5 animate-spin rounded-full border-2",
        light ? "border-white/30 border-t-white" : "border-g4 border-t-ink",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------- bottom sheet
export function Sheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Portal: page wrappers animate with transforms, which would trap a fixed sheet under the tab bar.
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <button aria-label="Close" className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet-in pb-safe absolute inset-x-0 bottom-0 mx-auto max-h-[92dvh] max-w-[520px] overflow-y-auto overscroll-contain rounded-t-[28px] bg-white px-5 pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-g4" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- toast
const toastStore = createStore<{ id: number; text: string } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string) {
  toastStore.set({ id: Date.now(), text });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastStore.set(null), 2600);
}

export function ToastHost() {
  const t = useStore(toastStore);
  if (!t) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-safe">
      <div
        key={t.id}
        role="status"
        className="fade-in mt-2 max-w-[440px] rounded-2xl bg-ink px-4 py-3 text-center text-[14px] font-medium text-white shadow-lg"
      >
        {t.text}
      </div>
    </div>
  );
}
