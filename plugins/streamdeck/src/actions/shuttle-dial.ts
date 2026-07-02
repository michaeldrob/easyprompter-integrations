import {
  action,
  DialDownEvent,
  DialRotateEvent,
  DidReceiveSettingsEvent,
  SingletonAction,
  TouchTapEvent,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";
import { executeEncoderAction, type EncoderActionSettings } from "./encoder-actions";

import { connectionManager } from "../connection-manager";
import {
  SHUTTLE_ICON,
  SHUTTLE_IDLE_ICON,
  SHUTTLE_FWD_1,
  SHUTTLE_FWD_2,
  SHUTTLE_FWD_3,
  SHUTTLE_REW_1,
  SHUTTLE_REW_2,
  SHUTTLE_REW_3,
} from "../icons/encoder-icons";
import type { ConnectionState, EasyPrompterSettings, PrompterState } from "../types";


// =============================================================================
// Rate-based spin speed detection
// =============================================================================

/**
 * Sliding window for measuring dial spin rate.
 * Instead of accumulating ticks, we measure how many events arrive per second
 * and map that to displacement. This gives true velocity-proportional control.
 */
interface SpinEvent {
  time: number;  // Date.now()
  ticks: number; // signed tick count from the event
}

/** How far back to look when measuring spin rate. */
const WINDOW_MS = 300;

/**
 * Minimum effective window duration (seconds) for rate calculation.
 * Prevents a single tick from producing an unreasonably high rate.
 * At 100ms floor: 1 tick → rate ≈ 10 tps → noticeable starting speed.
 */
const MIN_WINDOW_SECS = 0.1;

/**
 * Ticks-per-second at which displacement reaches the step-size cap.
 * Stream Deck+ dial: ~24 detents/rev.
 * Casual turn ≈ 8–12 tps, fast spin ≈ 20–30 tps.
 */
const MAX_RATE = 20;

/** How often the rate monitor ticks (ms). */
const MONITOR_INTERVAL = 60;

/**
 * Linear decay: displacement units subtracted per monitor tick.
 * At 60ms interval and 0.12/tick: full displacement (1.0) decays in ~500ms.
 * 0.4 (step 1 cap) decays in ~200ms. Fast and predictable.
 */
const DECAY_PER_TICK = 0.12;

/**
 * Step-size presets control the maximum displacement (speed ceiling).
 * Values match the HTML <option> values in encoder-settings.html.
 *
 *   Small  (1) → max 0.35 displacement → 1.75× multiplier
 *   Medium (3) → max 0.65 displacement → 3.25× multiplier
 *   Large  (5) → max 1.0  displacement → 5× multiplier (full speed)
 *
 * The app maps displacement linearly: multiplier = displacement × 5.
 */
const STEP_SIZE_CAPS: Record<number, number> = { 1: 0.35, 3: 0.65, 5: 1.0 };

/**
 * Evaluate a spin window: prune old events, compute rate and direction.
 */
function evaluateWindow(events: SpinEvent[], now: number): { rate: number; direction: number } {
  // Prune events outside the window
  const cutoff = now - WINDOW_MS;
  while (events.length > 0 && events[0].time < cutoff) {
    events.shift();
  }

  if (events.length === 0) return { rate: 0, direction: 0 };

  const totalAbsTicks = events.reduce((sum, e) => sum + Math.abs(e.ticks), 0);
  const netTicks = events.reduce((sum, e) => sum + e.ticks, 0);

  // Duration from first event to now (not to last event — we want to see rate drop when events stop)
  const durationSecs = Math.max(MIN_WINDOW_SECS, (now - events[0].time) / 1000);

  return {
    rate: totalAbsTicks / durationSecs,
    direction: Math.sign(netTicks) || Math.sign(events[events.length - 1].ticks),
  };
}

/**
 * Maps spin rate to displacement using a power curve.
 * rate=0 → 0, rate=MAX_RATE → cap, with smooth ramp in between.
 */
function rateToDisplacement(rate: number, cap: number): number {
  const fraction = Math.pow(Math.min(1, rate / MAX_RATE), 0.7);
  return fraction * cap;
}

// =============================================================================
// Display feedback
// =============================================================================

const FWD_ICONS = [SHUTTLE_FWD_1, SHUTTLE_FWD_2, SHUTTLE_FWD_3];
const REW_ICONS = [SHUTTLE_REW_1, SHUTTLE_REW_2, SHUTTLE_REW_3];

function intensityFromDisplacement(absDisplacement: number): number {
  if (absDisplacement < 0.33) return 0;
  if (absDisplacement < 0.66) return 1;
  return 2;
}

function shuttleFeedbackIcon(displacement: number): string {
  if (displacement === 0) return SHUTTLE_IDLE_ICON;
  const intensity = intensityFromDisplacement(Math.abs(displacement));
  return displacement > 0 ? FWD_ICONS[intensity] : REW_ICONS[intensity];
}

// =============================================================================
// Action
// =============================================================================

/**
 * Shuttle Dial action (Stream Deck+ encoder) — rotate to shuttle
 * forward/backward through the script, press to stop, touch to
 * toggle play/pause.
 *
 * Speed is proportional to how fast you physically spin the dial,
 * measured by event rate (ticks per second). Step size controls the
 * maximum speed ceiling.
 */
@action({ UUID: "com.easyprompter.streamdeck.shuttle-dial" })
export class ShuttleDial extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();

  /** Sliding window of recent spin events, keyed by action ID. */
  private spinWindows = new Map<string, SpinEvent[]>();
  /** Rate-monitor timers, keyed by action ID. */
  private monitorTimers = new Map<string, ReturnType<typeof setInterval>>();
  private isShuttling = new Map<string, boolean>();
  /** Last sent displacement, used for linear decay. */
  private lastDisplacement = new Map<string, number>();
  /** Last spin direction, preserved during decay. */
  private lastDirection = new Map<string, number>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    if (ev.action.isDial()) {
      ev.action.setFeedback({ icon: SHUTTLE_ICON, shuttleIcon: SHUTTLE_IDLE_ICON });
    }

    // Capture initial per-action settings from the appear payload
    // (onDidReceiveSettings only fires when the PI is opened/changed)
    if (ev.payload.settings) {
      this.encoderSettings.set(ev.action.id, ev.payload.settings as EncoderActionSettings);
    }

    const unsubs: (() => void)[] = [];

    // When settings change, stop any active shuttle to prevent
    // ghost commands on stale connections.
    const settingsUnsub = streamDeck.settings.onDidReceiveGlobalSettings<EasyPrompterSettings>(() => {
      this.stopMonitor(ev.action.id);
      this.spinWindows.delete(ev.action.id);
      this.isShuttling.set(ev.action.id, false);
    });
    unsubs.push(settingsUnsub.dispose.bind(settingsUnsub));

    unsubs.push(
      conn.onStateChange((_state: PrompterState) => {
        if (ev.action.isDial() && !this.isShuttling.get(ev.action.id)) {
          ev.action.setFeedback({
            shuttleIcon: shuttleFeedbackIcon(0),
          });
        }
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (ev.action.isDial()) {
          if (state === "disconnected") {
            ev.action.setFeedback({ shuttleIcon: SHUTTLE_IDLE_ICON });
          } else if (state === "waiting") {
            ev.action.setFeedback({ shuttleIcon: SHUTTLE_IDLE_ICON });
          }
        }
      })
    );

    this.unsubscribers.set(ev.action.id, unsubs);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent
  ): Promise<void> {
    const unsubs = this.unsubscribers.get(ev.action.id);
    if (unsubs) {
      unsubs.forEach((fn) => fn());
      this.unsubscribers.delete(ev.action.id);
    }
    this.stopMonitor(ev.action.id);
    this.releaseShuttle(ev.action.id);
    this.spinWindows.delete(ev.action.id);
    this.isShuttling.delete(ev.action.id);
    this.encoderSettings.delete(ev.action.id);
    this.lastDisplacement.delete(ev.action.id);
    this.lastDirection.delete(ev.action.id);
  }

  override async onDialRotate(
    ev: DialRotateEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    if (conn.connectionState !== "active") return;

    const actionId = ev.action.id;

    // Record this spin event in the sliding window
    let window = this.spinWindows.get(actionId);
    if (!window) {
      window = [];
      this.spinWindows.set(actionId, window);
    }
    window.push({ time: Date.now(), ticks: ev.payload.ticks });

    // Evaluate current spin rate
    const { rate, direction } = evaluateWindow(window, Date.now());

    // stepSize determines the max displacement ceiling (default: 3 = Medium)
    const stepSize = parseInt(String(this.encoderSettings.get(actionId)?.stepSize), 10) || 3;
    const cap = STEP_SIZE_CAPS[stepSize] ?? STEP_SIZE_CAPS[3];

    const displacement = rateToDisplacement(rate, cap) * direction;
    this.isShuttling.set(actionId, true);
    this.lastDisplacement.set(actionId, Math.abs(displacement));
    this.lastDirection.set(actionId, direction);

    conn.sendRemoteControl({ type: "shuttle_set", displacement });

    // Update dial feedback
    if (ev.action.isDial()) {
      ev.action.setFeedback({
        shuttleIcon: shuttleFeedbackIcon(displacement),
      });
    }

    // Start/restart the rate monitor (handles decay when spinning stops)
    this.startMonitor(actionId, ev, conn, cap);
  }

  // --- Private helpers ---

  /**
   * Periodically re-evaluates the spin window. While events are arriving,
   * displacement tracks the live rate. When events stop, displacement
   * decays linearly (constant subtraction per tick) for a fast,
   * predictable ramp-down.
   */
  private startMonitor(actionId: string, ev: DialRotateEvent, conn: ReturnType<typeof connectionManager.getConnection>, cap: number): void {
    // Don't restart if already monitoring — the existing timer is fine
    if (this.monitorTimers.has(actionId)) return;

    this.monitorTimers.set(actionId, setInterval(() => {
      const window = this.spinWindows.get(actionId);
      if (!window) {
        this.stopMonitor(actionId);
        return;
      }

      const now = Date.now();
      const { rate } = evaluateWindow(window, now);

      // Compute rate-based displacement
      const rateDisp = rateToDisplacement(rate, cap);
      let currentDisp = this.lastDisplacement.get(actionId) ?? 0;
      const direction = this.lastDirection.get(actionId) ?? 1;

      if (rateDisp >= currentDisp) {
        // Active spinning — track the live rate
        currentDisp = rateDisp;
      } else {
        // Spin slowing or stopped — linear decay
        currentDisp = Math.max(0, currentDisp - DECAY_PER_TICK);
      }

      this.lastDisplacement.set(actionId, currentDisp);

      if (currentDisp <= 0) {
        // Fully stopped
        this.lastDisplacement.set(actionId, 0);
        this.spinWindows.set(actionId, []);
        this.isShuttling.set(actionId, false);
        this.stopMonitor(actionId);
        conn.sendRemoteControl({ type: "shuttle_release" });

        if (ev.action.isDial()) {
          ev.action.setFeedback({
            shuttleIcon: shuttleFeedbackIcon(0),
          });
        }
        return;
      }

      const displacement = currentDisp * direction;
      conn.sendRemoteControl({ type: "shuttle_set", displacement });

      if (ev.action.isDial()) {
        ev.action.setFeedback({
          shuttleIcon: shuttleFeedbackIcon(displacement),
        });
      }
    }, MONITOR_INTERVAL));
  }

  private stopMonitor(actionId: string): void {
    const timer = this.monitorTimers.get(actionId);
    if (timer) {
      clearInterval(timer);
      this.monitorTimers.delete(actionId);
    }
  }

  private async releaseShuttle(actionId: string): Promise<void> {
    try {
      // Only release if this action was actually shuttling
      if (!this.isShuttling.get(actionId)) return;
      const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
      if (!settings.serverUrl || !settings.apiKey) return;
      const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
      if (conn.connectionState === "active") {
        conn.sendRemoteControl({ type: "shuttle_release" });
      }
    } catch {
      // Best-effort cleanup
    }
  }

  private encoderSettings = new Map<string, EncoderActionSettings>();

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    this.encoderSettings.set(ev.action.id, ev.payload.settings as EncoderActionSettings);
  }

  override async onDialDown(ev: DialDownEvent): Promise<void> {
    const settings = this.encoderSettings.get(ev.action.id);
    await executeEncoderAction(settings?.pressAction ?? "none");
  }

  override async onTouchTap(ev: TouchTapEvent): Promise<void> {
    const settings = this.encoderSettings.get(ev.action.id);
    await executeEncoderAction(settings?.touchAction ?? "none");
  }
}
