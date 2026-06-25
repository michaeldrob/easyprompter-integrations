import streamDeck from "@elgato/streamdeck";
import { connectionManager } from "./connection-manager";
import type { EasyPrompterSettings } from "./types";

const MIN_SPEED = 10;
const MAX_SPEED = 500;

/**
 * Debounced speed change utility.
 *
 * Accumulates rapid speed increments/decrements and sends a single
 * `set_speed` command after a short quiet period. This prevents the
 * "stale read" problem where rapid presses all read the same
 * `lastState.speed` and only apply one step's worth of change.
 */

/** Accumulated delta since last flush */
let pendingDelta = 0;
/** Debounce timer ID */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Debounce window in ms — short enough to feel instant, long enough to batch */
const DEBOUNCE_MS = 80;

/**
 * Queue a speed change. Multiple calls within DEBOUNCE_MS are batched
 * into a single `set_speed` command with the accumulated delta.
 */
export function queueSpeedChange(delta: number): void {
  pendingDelta += delta;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    flushSpeedChange();
  }, DEBOUNCE_MS);
}

/** Send the accumulated speed change immediately. */
async function flushSpeedChange(): Promise<void> {
  debounceTimer = null;
  const delta = pendingDelta;
  pendingDelta = 0;

  if (delta === 0) return;

  const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
  if (!settings.serverUrl || !settings.apiKey) return;

  const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
  if (conn.connectionState !== "active") return;

  const currentSpeed = conn.lastState?.speed ?? 150;
  const newSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, currentSpeed + delta));
  conn.sendRemoteControl({ type: "set_speed", speedWpm: newSpeed });
}
