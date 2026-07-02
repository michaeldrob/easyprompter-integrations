/**
 * SVG icons for encoder touch strip layouts.
 * Uses official Lucide icons matching the Companion/in-app icon set.
 * Encoded as data URIs for use with setFeedback({ icon: ICON_SVG }).
 */

/** Speed Control — Lucide "Gauge" (matches Companion speed_knob preset) */
export const SPEED_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 14 4-4"/>
    <path d="M3.34 19a10 10 0 1 1 17.32 0"/>
  </svg>`
)}`;

/** Font Size — Lucide "ALargeSmall" (matches Companion font_size_knob preset) */
export const FONT_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m15 16 2.536-7.328a1.02 1.02 1 0 1 1.928 0L22 16"/>
    <path d="M15.697 14h5.606"/>
    <path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/>
    <path d="M3.304 13h6.392"/>
  </svg>`
)}`;

/** Scroll Wheel / Jog — Lucide "RotateCw" (matches Companion jog_wheel preset) */
export const SCROLL_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
  </svg>`
)}`;

/** Shuttle — Lucide "ChevronsLeftRight" (matches in-app shuttle bar icons) */
export const SHUTTLE_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m9 7-5 5 5 5"/>
    <path d="m15 7 5 5-5 5"/>
  </svg>`
)}`;

/** Line Height — Lucide "ListChevronsUpDown" (matches Companion line_height_knob preset) */
export const LINE_HEIGHT_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 5h8"/>
    <path d="M3 12h8"/>
    <path d="M3 19h8"/>
    <path d="m15 8 3-3 3 3"/>
    <path d="m15 16 3 3 3-3"/>
  </svg>`
)}`;

/** Margin — Lucide "AlignHorizontalSpaceAround" (matches Companion margin_knob preset) */
export const MARGIN_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="6" height="10" x="9" y="7" rx="2"/>
    <path d="M4 22V2"/>
    <path d="M20 22V2"/>
  </svg>`
)}`;

/** Scroll Up — Lucide "ChevronsUp" in yellow (directional feedback) */
export const SCROLL_UP_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m17 11-5-5-5 5"/>
    <path d="m17 18-5-5-5 5"/>
  </svg>`
)}`;

/** Scroll Down — Lucide "ChevronsDown" in cyan (directional feedback) */
export const SCROLL_DOWN_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m7 6 5 5 5-5"/>
    <path d="m7 13 5 5 5-5"/>
  </svg>`
)}`;

/** Helper to build a colored Lucide SVG data URI */
function lucideSvg(color: string, ...paths: string[]): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${paths.join("\n    ")}
  </svg>`
  )}`;
}

/**
 * Shuttle icon builder — unified <<<  ···  >>> layout with selective highlighting.
 *
 * 3 chevrons per side, tapering toward center:
 *   Outer (L3/R3): full height (y 6–18, ±6 from center)
 *   Middle (L2/R2): medium (y 8–16, ±4)
 *   Inner (L1/R1): small (y 10–14, ±2)
 *
 * Highlighting lights chevrons from inside out as speed increases.
 */
const DIM = "#555555";
const FWD_COLOR = "#00E5FF";
const REW_COLOR = "#FFD700";

function shuttleSvg(opts: {
  l3?: string; l2?: string; l1?: string;
  center?: string;
  r1?: string; r2?: string; r3?: string;
}): string {
  const l3 = opts.l3 ?? DIM;
  const l2 = opts.l2 ?? DIM;
  const l1 = opts.l1 ?? DIM;
  const c  = opts.center ?? DIM;
  const r1 = opts.r1 ?? DIM;
  const r2 = opts.r2 ?? DIM;
  const r3 = opts.r3 ?? DIM;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m8 6-5 6 5 6" stroke="${l3}"/>
    <path d="m14 8-4 4 4 4" stroke="${l2}"/>
    <path d="m19 10-3 2 3 2" stroke="${l1}"/>
    <line x1="22" y1="12" x2="38" y2="12" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0.1 4"/>
    <path d="m41 10 3 2-3 2" stroke="${r1}"/>
    <path d="m46 8 4 4-4 4" stroke="${r2}"/>
    <path d="m52 6 5 6-5 6" stroke="${r3}"/>
  </svg>`
  )}`;
}

/** Idle — all dim */
export const SHUTTLE_IDLE_ICON = shuttleSvg({});

/** Forward speed 1 — center + inner right chevron */
export const SHUTTLE_FWD_1 = shuttleSvg({ center: FWD_COLOR, r1: FWD_COLOR });

/** Forward speed 2 — center + inner + middle right */
export const SHUTTLE_FWD_2 = shuttleSvg({ center: FWD_COLOR, r1: FWD_COLOR, r2: FWD_COLOR });

/** Forward speed 3 — center + all three right chevrons */
export const SHUTTLE_FWD_3 = shuttleSvg({ center: FWD_COLOR, r1: FWD_COLOR, r2: FWD_COLOR, r3: FWD_COLOR });

/** Rewind speed 1 — center + inner left chevron */
export const SHUTTLE_REW_1 = shuttleSvg({ center: REW_COLOR, l1: REW_COLOR });

/** Rewind speed 2 — center + inner + middle left */
export const SHUTTLE_REW_2 = shuttleSvg({ center: REW_COLOR, l1: REW_COLOR, l2: REW_COLOR });

/** Rewind speed 3 — center + all three left chevrons */
export const SHUTTLE_REW_3 = shuttleSvg({ center: REW_COLOR, l1: REW_COLOR, l2: REW_COLOR, l3: REW_COLOR });
