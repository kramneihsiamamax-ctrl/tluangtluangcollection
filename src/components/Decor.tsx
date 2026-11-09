/** Subtle thin grey curved line-art for hero cards. Pure SVG, no layout cost. */
export function HeroLines({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const stroke = tone === "dark" ? "rgba(255,255,255,0.14)" : "#E6E6E6";
  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <path d="M-20 190 C 80 120, 160 250, 260 170 S 400 60, 440 110" stroke={stroke} strokeWidth="1.2" />
      <path d="M-20 215 C 90 150, 170 270, 270 195 S 410 90, 440 140" stroke={stroke} strokeWidth="1.2" />
      <path d="M180 -20 C 230 40, 300 20, 330 80 S 380 160, 430 150" stroke={stroke} strokeWidth="1.2" />
      <circle cx="338" cy="58" r="36" stroke={stroke} strokeWidth="1.2" />
      <circle cx="338" cy="58" r="58" stroke={stroke} strokeWidth="1" />
    </svg>
  );
}

/** Logo (light monogram) in a black rounded tile. */
export function LogoTile({ size = 88, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-ink ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/watermark-light.png"
        alt="TluangTluang Collection logo"
        width={885}
        height={705}
        style={{ width: size * 0.78, height: "auto" }}
        decoding="async"
      />
    </div>
  );
}
