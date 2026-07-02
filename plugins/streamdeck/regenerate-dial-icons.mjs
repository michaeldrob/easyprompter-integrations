/**
 * Regenerate Stream Deck+ encoder dial icons as 72×72 PNGs
 * with larger, centered Lucide SVG artwork.
 *
 * Requires: npm install sharp (dev dependency already available via pnpm)
 * Usage:    node regenerate-dial-icons.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTIONS_DIR = join(
  __dirname,
  "com.easyprompter.streamdeck.sdPlugin",
  "imgs",
  "actions"
);

const SIZE = 72; // output canvas size
const PADDING = 14; // padding around the icon artwork
const ICON_SIZE = SIZE - PADDING * 2; // 56px of artwork centered in 72px

/**
 * Each dial icon: file basename (without .png) → Lucide SVG path data.
 * SVGs use viewBox="0 0 24 24" so we scale the artwork to fill ICON_SIZE.
 */
const ICONS = {
  "speed-dial": {
    // Gauge (speedometer)
    paths: [
      '<path d="m12 14 4-4"/>',
      '<path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    ],
  },
  "font-size": {
    // ALargeSmall
    paths: [
      '<path d="m15 16 2.536-7.328a1.02 1.02 1 0 1 1.928 0L22 16"/>',
      '<path d="M15.697 14h5.606"/>',
      '<path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/>',
      '<path d="M3.304 13h6.392"/>',
    ],
  },
  "scroll-wheel": {
    // RotateCw
    paths: [
      '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>',
      '<path d="M21 3v5h-5"/>',
    ],
  },
  "shuttle-dial": {
    // ChevronsLeftRight
    paths: ['<path d="m9 7-5 5 5 5"/>', '<path d="m15 7 5 5-5 5"/>'],
  },
  "line-height": {
    // ListChevronsUpDown (matching the encoder-icons.ts Lucide icon)
    paths: [
      '<path d="M3 5h8"/>',
      '<path d="M3 12h8"/>',
      '<path d="M3 19h8"/>',
      '<path d="m15 8 3-3 3 3"/>',
      '<path d="m15 16 3 3 3-3"/>',
    ],
  },
  margin: {
    // AlignHorizontalSpaceAround
    paths: [
      '<rect width="6" height="10" x="9" y="7" rx="2"/>',
      '<path d="M4 22V2"/>',
      '<path d="M20 22V2"/>',
    ],
  },
};

/**
 * Build an SVG string with the icon centered in a SIZE×SIZE canvas.
 */
function buildSvg(pathsArr) {
  const paths = pathsArr.join("\n    ");
  // The inner <g> is translated so the 24×24 viewBox artwork
  // is drawn at (PADDING, PADDING) and scaled to ICON_SIZE.
  const scale = ICON_SIZE / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <g transform="translate(${PADDING}, ${PADDING}) scale(${scale})">
    <g fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${paths}
    </g>
  </g>
</svg>`;
}

// Try to use sharp if available, otherwise fall back to writing SVGs and using sips
async function main() {
  let useSharp = false;
  let sharp;
  try {
    sharp = (await import("sharp")).default;
    useSharp = true;
    console.log("Using sharp for PNG generation");
  } catch {
    console.log("sharp not available, using rsvg-convert or sips fallback");
  }

  for (const [name, icon] of Object.entries(ICONS)) {
    const svgStr = buildSvg(icon.paths);
    const outPath = join(ACTIONS_DIR, `${name}.png`);

    if (useSharp) {
      const buf = await sharp(Buffer.from(svgStr))
        .resize(SIZE, SIZE)
        .png()
        .toBuffer();
      writeFileSync(outPath, buf);
      console.log(`  ✓ ${name}.png (${buf.length} bytes)`);
    } else {
      // Write SVG to temp, convert with sips
      const svgPath = join(ACTIONS_DIR, `${name}.svg`);
      writeFileSync(svgPath, svgStr);

      // Try rsvg-convert first (brew install librsvg), then sips
      try {
        execSync(
          `rsvg-convert -w ${SIZE} -h ${SIZE} -o "${outPath}" "${svgPath}"`,
          { stdio: "pipe" }
        );
        console.log(`  ✓ ${name}.png (rsvg-convert)`);
      } catch {
        // sips can convert SVG on macOS
        try {
          execSync(
            `sips -s format png -z ${SIZE} ${SIZE} "${svgPath}" --out "${outPath}"`,
            { stdio: "pipe" }
          );
          console.log(`  ✓ ${name}.png (sips)`);
        } catch (e) {
          console.error(`  ✗ ${name}: could not convert SVG to PNG`);
          console.error(
            "    Install sharp (pnpm add -D sharp) or librsvg (brew install librsvg)"
          );
        }
      }

      // Clean up temp SVG
      try {
        execSync(`rm "${svgPath}"`, { stdio: "pipe" });
      } catch {}
    }
  }

  console.log("\nDone! Rebuild the plugin to pick up the new icons.");
}

main().catch(console.error);
