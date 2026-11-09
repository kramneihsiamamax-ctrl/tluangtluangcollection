"use client";

import { Eraser, LayoutTemplate, Stamp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HeroLines, LogoTile } from "@/components/Decor";
import { Button } from "@/components/ui";
import { LS } from "@/lib/constants";

const FEATURES = [
  { Icon: Eraser, title: "Automatic background removal", sub: "Runs on your phone — fast and private" },
  { Icon: LayoutTemplate, title: "50+ ready templates", sub: "Clean studio backdrops, or upload your own" },
  { Icon: Stamp, title: "Your logo on every photo", sub: "Watermark placed for you, every time" },
];

export default function Welcome() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let visited = false;
    try {
      visited = localStorage.getItem(LS.visited) === "1";
    } catch {
      /* ignore */
    }
    if (visited) router.replace("/home");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reveal only after the localStorage check
    else setShow(true);
  }, [router]);

  const start = () => {
    try {
      localStorage.setItem(LS.visited, "1");
    } catch {
      /* ignore */
    }
    router.replace("/home");
  };

  return (
    <main
      className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-[520px] flex-col px-5 transition-opacity duration-200"
      style={{ opacity: show ? 1 : 0 }}
    >
      <section className="relative mt-4 overflow-hidden rounded-[28px] border border-line bg-white px-6 pb-8 pt-10">
        <HeroLines tone="light" />
        <div className="relative flex flex-col items-center text-center">
          <LogoTile size={96} />
          <h1 className="mt-6 text-[28px] font-bold leading-tight tracking-tight">TluangTluang Collection</h1>
          <p className="mt-2 text-[16px] text-sub">Studio-quality product photos in seconds.</p>
        </div>
      </section>

      <ul className="mt-5 space-y-3">
        {FEATURES.map(({ Icon, title, sub }) => (
          <li key={title} className="flex items-center gap-4 rounded-[20px] border border-line bg-white p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-g2">
              <Icon size={22} strokeWidth={1.8} />
            </span>
            <span>
              <span className="block text-[16px] font-semibold">{title}</span>
              <span className="block text-[14px] text-sub">{sub}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <Button block onClick={start}>
          Get Started
        </Button>
        <p className="mt-3 text-center text-[14px] text-sub">No login needed</p>
      </div>
    </main>
  );
}
