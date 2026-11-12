/* themes.mjs — the twelve colours a ministry may give its own page and its Bible (migration 0012). Founder, 2026-11-12: the ministry
   changes "the pictures and colors", from "curated themes". Each theme is one accent; its other three shades are worked out from it
   here, so every theme keeps the rules the whole site keeps: a pale ground (luminance 0.9 or more), a pale soft band, a deep shade for
   small words and buttons that reads at 7 to 1 on white, and never red. tests/unit-test.mjs proves each of these for every theme, and
   that public/css/lm.css carries exactly these values (node tools/make-themes.mjs rewrites that block). The network's own pages keep
   the one gold; only /m/<slug> and its Bible wear a theme. */

export const THEME_DEFAULT = "gold";
/* the order the form shows them, and the plain name a person reads */
export const THEME_LIST = [
  ["gold", "Gold", "#d97706"], ["clay", "Clay", "#b5651d"], ["rose", "Rose", "#c0507e"], ["plum", "Plum", "#8e44ad"],
  ["indigo", "Indigo", "#4f46e5"], ["ocean", "Ocean", "#1e6fb8"], ["sky", "Sky", "#0284c7"], ["teal", "Teal", "#0f8a80"],
  ["forest", "Forest", "#2f7d4f"], ["olive", "Olive", "#7a8a2e"], ["earth", "Earth", "#9a6b3f"], ["slate", "Slate", "#56677d"],
];

const hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
export const lum = (h) => { const c = rgb(h).map((v) => v / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/* the light test's own reading of red: a strong red channel with weak green and blue */
export const isRed = (h) => { const [r, g, b] = rgb(h); return r > 150 && g < 90 && b < 90; };

/* the deep shade: the accent darkened toward ink, step by step, until white words on it read at 7 to 1 */
function deep(accent) { for (let t = 0; t <= 1; t += 0.02) { const c = mix(accent, "#10161f", t); if (contrast(c, "#ffffff") >= 7) return c; } return "#1b2430"; }

/** every theme: { key, name, accent, ink, soft, ground } */
export const THEMES = Object.fromEntries(THEME_LIST.map(([key, name, accent]) => [key, {
  key, name, accent, ink: deep(accent), soft: mix(accent, "#ffffff", 0.88), ground: mix(accent, "#ffffff", 0.965),
}]));

/** the key to wear: a known theme, or the default */
export const themeOf = (key) => (Object.prototype.hasOwnProperty.call(THEMES, key) ? key : THEME_DEFAULT);

/** the block of public/css/lm.css that defines the themes (written by tools/make-themes.mjs, read back by the unit test) */
export function themeCss() {
  return Object.values(THEMES).map((t) => `.theme-${t.key}{--t:${t.accent};--t-ink:${t.ink};--t-soft:${t.soft};--t-ground:${t.ground}}`).join("\n");
}
