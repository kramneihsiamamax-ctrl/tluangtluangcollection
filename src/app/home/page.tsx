"use client";

import { ArrowRight, Camera, ChevronRight, LayoutGrid, Stamp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AboutSheet } from "@/components/AboutSheet";
import { usePhotoPicker } from "@/components/AppProviders";
import { HeroLines } from "@/components/Decor";
import { RecentGrid } from "@/components/RecentGrid";
import { TabPage } from "@/components/TabBar";
import { creationUrl, refreshRecent, useRecent } from "@/lib/creations";
import { useSettings } from "@/lib/settings";
import { useTemplates } from "@/lib/templates";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const openPicker = usePhotoPicker();
  const { list: templates, loaded } = useTemplates();
  const settings = useSettings();
  const recent = useRecent();
  const [about, setAbout] = useState(false);
  const [hello, setHello] = useState("Hello");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- time-of-day greeting is client-only
    setHello(greeting());
    void refreshRecent();
  }, []);

  const wmOn = settings.watermark.enabled;

  return (
    <TabPage>
      <header className="flex items-center justify-between pb-4 pt-2">
        <div>
          <p className="text-[14px] text-sub">{hello}</p>
          <h1 className="text-[24px] font-bold tracking-tight">TluangTluang Studio</h1>
        </div>
        <button
          type="button"
          onClick={() => setAbout(true)}
          aria-label="About TluangTluang Collection"
          className="press flex h-12 w-12 items-center justify-center rounded-[14px] border border-line bg-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/watermark-dark.png" alt="" width={885} height={705} className="h-auto w-9" />
        </button>
      </header>

      <button
        type="button"
        onClick={openPicker}
        className="press relative block w-full overflow-hidden rounded-[28px] bg-ink p-6 text-left text-white"
      >
        <HeroLines tone="dark" />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
          <Camera size={24} strokeWidth={1.8} />
        </span>
        <span className="relative mt-10 block text-[24px] font-bold leading-tight">Create new photo</span>
        <span className="relative mt-1 flex items-center justify-between text-[15px] text-white/70">
          Pick from camera or gallery
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink">
            <ArrowRight size={20} strokeWidth={2} />
          </span>
        </span>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link href="/templates" className="press rounded-[22px] border border-line bg-white p-4">
          <LayoutGrid size={22} strokeWidth={1.8} className="text-icon" />
          <p className="mt-6 text-[26px] font-bold leading-none">{loaded ? templates.length : "—"}</p>
          <p className="mt-1 text-[14px] text-sub">Templates</p>
        </Link>
        <Link href="/brand" className="press rounded-[22px] border border-line bg-white p-4">
          <Stamp size={22} strokeWidth={1.8} className="text-icon" />
          <p className="mt-6 text-[26px] font-bold leading-none">{wmOn ? "On" : "Off"}</p>
          <p className="mt-1 text-[14px] text-sub">Watermark</p>
        </Link>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[18px] font-bold">Recent</h2>
          <Link href="/gallery" className="press flex h-11 items-center gap-0.5 text-[14px] font-semibold text-sub">
            See all <ChevronRight size={18} />
          </Link>
        </div>
        <RecentGrid
          items={recent.list.slice(0, 9).map((c) => ({ id: c.id, url: creationUrl(c), ratio: c.ratio }))}
          loading={!recent.loaded}
          empty="Your photos from the last 24 hours will show up here."
        />
      </section>

      <AboutSheet open={about} onClose={() => setAbout(false)} />
    </TabPage>
  );
}
