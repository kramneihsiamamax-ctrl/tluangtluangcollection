/** Saving to the phone: Web Share API level 2 first, `<a download>` as the fallback. */

export function exportFilename(d = new Date(), suffix = ""): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `tluangtluang-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}${suffix}.jpg`;
}

export function toJpegFile(blob: Blob, name = exportFilename()): File {
  return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files });
  } catch {
    return false;
  }
}

export type SaveResult = "shared" | "downloaded" | "cancelled";

export function download(files: File[]) {
  files.forEach((f, i) => {
    setTimeout(() => {
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }, i * 350);
  });
}

/** Share sheet (iOS: "Save Image" → Photos; Android: Gallery / Instagram). Falls back to download. */
export async function shareFiles(files: File[]): Promise<SaveResult> {
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      // NotAllowedError (lost user activation) etc. → fall back to download
    }
  }
  download(files);
  return "downloaded";
}

/**
 * "Save": on iOS the share sheet is the only way into Photos, so use it there.
 * Elsewhere download directly (Android puts it in Gallery → Downloads).
 */
export async function saveFiles(files: File[]): Promise<SaveResult> {
  if (isIOS()) return shareFiles(files);
  download(files);
  return "downloaded";
}
