"use client";

import { House, Images, LayoutGrid, Plus, Stamp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePhotoPicker } from "./AppProviders";
import { cx } from "./ui";

const TABS = [
  { href: "/home", label: "Home", Icon: House },
  { href: "/templates", label: "Templates", Icon: LayoutGrid },
  null,
  { href: "/brand", label: "Brand", Icon: Stamp },
  { href: "/gallery", label: "Gallery", Icon: Images },
] as const;

export function TabBar() {
  const path = usePathname();
  const openPicker = usePhotoPicker();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 px-4"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
    >
      <div className="mx-auto flex h-[68px] max-w-[480px] items-center justify-between rounded-[26px] border border-line bg-white px-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        {TABS.map((t) =>
          t === null ? (
            <button
              key="new"
              type="button"
              onClick={openPicker}
              aria-label="New photo"
              className="press flex h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-ink text-white"
            >
              <Plus size={26} strokeWidth={2} />
            </button>
          ) : (
            <Link
              key={t.href}
              href={t.href}
              prefetch
              className={cx(
                "press flex h-[52px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold",
                path === t.href ? "text-ink" : "text-icon",
              )}
              aria-current={path === t.href ? "page" : undefined}
            >
              <t.Icon size={22} strokeWidth={path === t.href ? 2 : 1.8} />
              {t.label}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}

/** Page wrapper for tab screens: safe-area top, room for the floating tab bar. */
export function TabPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="page-in pt-safe mx-auto min-h-dvh max-w-[520px] px-4 pb-[120px]">{children}</main>
      <TabBar />
    </>
  );
}
