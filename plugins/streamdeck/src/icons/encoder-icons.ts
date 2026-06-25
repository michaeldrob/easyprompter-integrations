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
