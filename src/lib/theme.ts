// Apply restaurant themeColor to CSS variables (oklch)
// Converts a hex color to oklch components and derives a small palette.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const v =
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h.padEnd(6, "0");
  const num = parseInt(v.slice(0, 6), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToOklch([r, g, b]: [number, number, number]): {
  l: number;
  c: number;
  h: number;
} {
  const srgb = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  const [R, G, B] = srgb;
  // linear sRGB -> LMS
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  
  const s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(a * a + b2 * b2);
  let H = (Math.atan2(b2, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: H };
}

function oklchStr(l: number, c: number, h: number) {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(2)})`;
}

export function applyThemeColor(hex: string | undefined | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!hex) {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-foreground");
    root.style.removeProperty("--brand");
    root.style.removeProperty("--brand-soft");
    return;
  }
  const { l, c, h } = rgbToOklch(hexToRgb(hex));
  const primary = oklchStr(Math.min(0.7, Math.max(0.45, l)), c, h);
  const ring = oklchStr(Math.min(0.78, l + 0.1), c * 0.9, h);
  const soft = oklchStr(0.97, Math.min(0.04, c * 0.2), h);
  const accent = oklchStr(0.95, Math.min(0.06, c * 0.3), h);
  const fg = l < 0.55 ? "oklch(0.985 0 0)" : "oklch(0.15 0 0)";
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", fg);
  root.style.setProperty("--ring", ring);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-foreground", "oklch(0.2 0 0)");
  root.style.setProperty("--brand", primary);
  root.style.setProperty("--brand-soft", soft);
}
