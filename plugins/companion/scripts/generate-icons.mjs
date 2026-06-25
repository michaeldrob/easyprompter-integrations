/**
 * Generate PNG icons from official lucide-static SVGs for Companion presets.
 * Uses the exact same icon shapes as the operator HUD.
 * Usage: node scripts/generate-icons.mjs > src/icons.ts
 */
import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "node_modules", "lucide-static", "icons");
const CANVAS = 72;

function readLucideSvg(name) {
  return readFileSync(join(ICONS_DIR, `${name}.svg`), "utf8");
}

/** Recolor an SVG: set stroke to white, remove class, set explicit size. */
function prepareSvg(svgStr, size) {
  return svgStr
    .replace(/stroke="currentColor"/g, 'stroke="white"')
    .replace(/class="[^"]*"/g, "")
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`);
}

/** Render a single Lucide icon centered in canvas. */
async function renderCentered(iconName, iconSize) {
  const svg = prepareSvg(readLucideSvg(iconName), iconSize);
  const offset = Math.round((CANVAS - iconSize) / 2);

  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
    <g transform="translate(${offset}, ${offset})">
      ${extractInner(svg)}
    </g>
  </svg>`;

  return toBase64(wrapper, iconSize);
}

/** Render a Lucide icon centered and horizontally flipped. */
async function renderCenteredFlipped(iconName, iconSize) {
  const svg = prepareSvg(readLucideSvg(iconName), iconSize);
  const offset = Math.round((CANVAS - iconSize) / 2);

  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
    <g transform="translate(${CANVAS - offset}, ${offset}) scale(-1, 1)">
      ${extractInner(svg)}
    </g>
  </svg>`;

  return toBase64(wrapper, iconSize);
}

/** Render icon with circle background (play/pause style). */
async function renderWithCircle(iconName, iconSize) {
  const svg = prepareSvg(readLucideSvg(iconName), iconSize);
  const offset = Math.round((CANVAS - iconSize) / 2);

  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
    <circle cx="36" cy="36" r="30" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
    <g transform="translate(${offset}, ${offset})">
      ${extractInner(svg)}
    </g>
  </svg>`;

  return toBase64(wrapper, iconSize);
}

/** Render icon small at top of canvas (for buttons with text below). */
async function renderTop(iconName, iconSize) {
  const svg = prepareSvg(readLucideSvg(iconName), iconSize);
  const offsetX = Math.round((CANVAS - iconSize) / 2);
  const offsetY = 4;

  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
    <g transform="translate(${offsetX}, ${offsetY})">
      ${extractInner(svg)}
    </g>
  </svg>`;

  return toBase64(wrapper, iconSize);
}

/** Render composite prev/next marker: chevron + bookmark side by side. */
async function renderMarker(direction) {
  const chevronSize = 22;
  const bookmarkSize = 30;
  const chevronName = direction === "prev" ? "chevron-left" : "chevron-right";

  const chevSvg = prepareSvg(readLucideSvg(chevronName), chevronSize);
  const bmSvg = prepareSvg(readLucideSvg("bookmark"), bookmarkSize);

  const chevY = Math.round((CANVAS - chevronSize) / 2);
  const bmY = Math.round((CANVAS - bookmarkSize) / 2);

  let inner;
  if (direction === "prev") {
    inner = `
      <g transform="translate(6, ${chevY})">${extractInner(chevSvg)}</g>
      <g transform="translate(24, ${bmY})">${extractInner(bmSvg)}</g>`;
  } else {
    inner = `
      <g transform="translate(12, ${bmY})">${extractInner(bmSvg)}</g>
      <g transform="translate(38, ${chevY})">${extractInner(chevSvg)}</g>`;
  }

  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
    ${inner}
  </svg>`;

  return toBase64(wrapper);
}

/** Extract inner SVG content (everything inside <svg>...</svg>), preserving attributes via a wrapping <svg>. */
function extractInner(svgStr) {
  // Re-wrap the full SVG so sharp can render it; we just need the positioned version
  return svgStr;
}

async function toBase64(svgStr) {
  const png = await sharp(Buffer.from(svgStr)).png().toBuffer();
  return png.toString("base64");
}

async function main() {
  const results = {};

  // Transport — full size centered (44px)
  results.play = await renderWithCircle("play", 44);
  results.pause = await renderWithCircle("pause", 44);
  results.reset = await renderCentered("rotate-ccw", 44);
  results.fast_forward = await renderCentered("chevrons-right", 44);
  results.rewind = await renderCentered("chevrons-left", 44);
  results.skip_back = await renderMarker("prev");
  results.skip_forward = await renderMarker("next");

  // Top-positioned icons (28px at top, for text+icon buttons)
  results.eye = await renderCentered("eye", 44);
  results.eye_off = await renderCentered("eye-off", 44);
  results.a_large_small = await renderTop("a-large-small", 28);
  results.list_chevrons = await renderTop("list-chevrons-up-down", 28);
  results.align_h_space = await renderTop("align-horizontal-space-around", 28);
  results.gauge = await renderTop("gauge", 28);
  results.rotate_cw = await renderTop("rotate-cw", 28);
  results.radio = await renderTop("radio", 28);
  results.radio_off = await renderTop("radio-off", 28);

  // Small centered icons for speed up/down buttons
  results.gauge_small = await renderCentered("gauge", 36);
  results.gauge_small_flip = await renderCenteredFlipped("gauge", 36);

  // EasyPrompter wordmark logo — trim edges, fit to full canvas width
  const logoPath = join(__dirname, "ep-logo.png");
  const logoTrimmed = await sharp(logoPath).trim().toBuffer();
  const logoResized = await sharp(logoTrimmed)
    .resize(CANVAS - 4, null, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const logoMeta = await sharp(logoResized).metadata();
  const logoCanvas = sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: logoResized,
    left: Math.round((CANVAS - logoMeta.width) / 2),
    top: 4,
  }]);
  results.logo_top = (await logoCanvas.png().toBuffer()).toString("base64");

  console.log("// Auto-generated icon PNGs for Companion presets");
  console.log("// Source: lucide-static SVGs, matching operator HUD icons");
  console.log("// Generated by: node scripts/generate-icons.mjs > src/icons.ts");
  console.log("export const ICONS = {");
  for (const [name, b64] of Object.entries(results)) {
    console.log(`  ${name}: "${b64}",`);
  }
  console.log("} as const;");
}

main().catch(console.error);
