import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the absolute path to the plugin's sdPlugin root directory.
 * The built JS runs from `com.easyprompter.streamdeck.sdPlugin/bin/plugin.js`,
 * so the sdPlugin root is one level up.
 */
function getPluginRoot(): string {
  // In ESM, __dirname isn't available. Use import.meta.url or process.argv[1].
  try {
    const currentFile = fileURLToPath(import.meta.url);
    return join(dirname(currentFile), "..");
  } catch {
    // Fallback for bundled code where import.meta.url might not resolve correctly
    const argv1 = process.argv[1];
    if (argv1) return join(dirname(argv1), "..");
    return ".";
  }
}

const PLUGIN_ROOT = getPluginRoot();

/**
 * Cache of base layout JSON strings keyed by layout name.
 * Avoids re-reading the file on every color change.
 */
const layoutCache = new Map<string, string>();

/**
 * Tracks the last color written per layout file to avoid redundant disk writes.
 */
const lastColorWritten = new Map<string, string>();

/**
 * Default bar fill color (matches the layout JSON defaults).
 */
const DEFAULT_BAR_COLOR = "#00E5FF";

/**
 * Changes the bar fill color for a dial action by generating a modified layout
 * file and switching to it via `setFeedbackLayout`.
 *
 * Stream Deck's `setFeedback` cannot override `bar_fill_c` at runtime — it's
 * a layout-level property. The workaround is to write a modified copy of the
 * layout JSON with the desired color and then call `setFeedbackLayout` to
 * switch to it.
 *
 * @param action - The Stream Deck action (must support `setFeedbackLayout`)
 * @param layoutName - Base layout filename without extension (e.g., "font-layout")
 * @param color - Hex color string (e.g., "#448AFF") or null to revert to default
 */
export function setBarColor(
  action: { setFeedbackLayout(layout: string): Promise<void> },
  layoutName: string,
  color: string | null,
): boolean {
  const effectiveColor = color ?? DEFAULT_BAR_COLOR;

  // If the color matches what we last wrote, skip the disk write
  const cacheKey = `${layoutName}`;
  if (lastColorWritten.get(cacheKey) === effectiveColor) return false;

  // Read the base layout (cached after first read)
  if (!layoutCache.has(layoutName)) {
    const basePath = join(PLUGIN_ROOT, "layouts", `${layoutName}.json`);
    try {
      layoutCache.set(layoutName, readFileSync(basePath, "utf-8"));
    } catch {
      return false; // Layout file not found — bail silently
    }
  }

  const baseJson = layoutCache.get(layoutName)!;

  // Replace bar_fill_c value in the JSON string
  // The layout JSON always has exactly one bar_fill_c entry like: "bar_fill_c": "#00E5FF"
  const modifiedJson = baseJson.replace(
    /"bar_fill_c":\s*"[^"]*"/,
    `"bar_fill_c": "${effectiveColor}"`,
  );

  // Write the modified layout to a "-active" variant file
  const activePath = join(PLUGIN_ROOT, "layouts", `${layoutName}-active.json`);
  try {
    writeFileSync(activePath, modifiedJson, "utf-8");
  } catch {
    return false; // Can't write — bail silently
  }

  lastColorWritten.set(cacheKey, effectiveColor);

  // Switch the action to the new layout
  action.setFeedbackLayout(`layouts/${layoutName}-active.json`);
  return true;
}
