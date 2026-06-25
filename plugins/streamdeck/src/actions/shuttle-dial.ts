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
import { SHUTTLE_ICON } from "../icons/encoder-icons";
import type { ConnectionState, EasyPrompterSettings, PrompterState } from "../types";


/**
 * Minimum displacement (3x out of 5x max multiplier in the app).
 * Even the smallest rotation should produce at least this displacement.
 */
const MIN_DISPLACEMENT = 0.6;

/**
 * Maps accumulated ticks to a shuttle displacement value.
 * Range: ±MIN_DISPLACEMENT to ±1.0 (maps to 3x–5x in the app).
 * Any non-zero tick immediately starts at MIN_DISPLACEMENT.
 */
function ticksToDisplacement(ticks: number): number {
  if (ticks === 0) return 0;
  const clamped = Math.max(-7, Math.min(7, ticks));
  const absFraction = Math.pow(Math.abs(clamped) / 7, 0.7);
  // Scale from MIN_DISPLACEMENT to 1.0
  const absDisplacement = MIN_DISPLACEMENT + (1.0 - MIN_DISPLACEMENT) * Math.min(1.0, absFraction);
  return Math.sign(clamped) * absDisplacement;
}

/**
 * Returns a direction label and color for the current shuttle state.
 * At rest, shows play/pause state instead of directional arrows.
 */
function shuttleFeedback(displacement: number, isPlaying?: boolean): { label: string; color: string } {
  if (displacement === 0) {
    if (isPlaying) return { label: "▶", color: "#4CAF50" };
    return { label: "▮▮", color: "#888888" };
  }
  if (displacement > 0) return { label: "▶▶", color: "#00E5FF" };
  return { label: "◀◀", color: "#FFD700" };
}

/** How quickly accumulated ticks decay back to zero (ms). */
const DECAY_INTERVAL = 80;
const DECAY_RATE = 0.5;
const STOP_THRESHOLD = 0.3;

/**
 * Shuttle Dial action (Stream Deck+ encoder) — rotate to shuttle
 * forward/backward through the script, press to stop, touch to
 * toggle play/pause.
 */
@action({ UUID: "com.easyprompter.streamdeck.shuttle-dial" })
export class ShuttleDial extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();

  /**
   * Accumulated ticks for smooth shuttle control.
   * Decays over time so the shuttle slows and stops when you stop rotating.
   * Keyed by action ID so each placed dial gets independent state.
   */
  private accumulatedTicks = new Map<string, number>();
  private decayTimers = new Map<string, ReturnType<typeof setInterval>>();
  private isShuttling = new Map<string, boolean>();
  private playState = new Map<string, boolean>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    if (ev.action.isDial()) {
      ev.action.setFeedback({ icon: SHUTTLE_ICON });
    }

    const unsubs: (() => void)[] = [];

    // When settings change, stop any active shuttle/decay to prevent
    // ghost commands on stale connections.
    const settingsUnsub = streamDeck.settings.onDidReceiveGlobalSettings<EasyPrompterSettings>(() => {
      this.stopDecay(ev.action.id);
      this.accumulatedTicks.set(ev.action.id, 0);
      this.isShuttling.set(ev.action.id, false);
    });
    unsubs.push(settingsUnsub.dispose.bind(settingsUnsub));

    unsubs.push(
      conn.onStateChange((state: PrompterState) => {
        const isPlaying = state.isPlaying ?? false;
        this.playState.set(ev.action.id, isPlaying);
        if (ev.action.isDial() && !this.isShuttling.get(ev.action.id)) {
          const fb = shuttleFeedback(0, isPlaying);
          ev.action.setFeedback({
            shuttleValue: { value: fb.label, color: fb.color },
          });
        }
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (ev.action.isDial()) {
          if (state === "disconnected") {
            ev.action.setFeedback({ shuttleValue: "Offline" });
          } else if (state === "waiting") {
            ev.action.setFeedback({ shuttleValue: "Waiting..." });
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
    this.stopDecay(ev.action.id);
    this.releaseShuttle(ev.action.id);
    this.accumulatedTicks.delete(ev.action.id);
    this.isShuttling.delete(ev.action.id);
    this.encoderSettings.delete(ev.action.id);
    this.playState.delete(ev.action.id);
  }

  override async onDialRotate(
    ev: DialRotateEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    if (conn.connectionState !== "active") return;

    // Accumulate ticks
    const actionId = ev.action.id;
    const prevTicks = this.accumulatedTicks.get(actionId) ?? 0;
    const stepSize = parseInt(String(this.encoderSettings.get(ev.action.id)?.stepSize), 10) || 1;
    const newTicks = prevTicks + ev.payload.ticks * stepSize;
    this.accumulatedTicks.set(actionId, newTicks);

    const displacement = ticksToDisplacement(newTicks);
    this.isShuttling.set(actionId, true);

    conn.sendRemoteControl({ type: "shuttle_set", displacement });

    // Update dial feedback
    if (ev.action.isDial()) {
      const fb = shuttleFeedback(displacement);
      ev.action.setFeedback({
        shuttleValue: { value: fb.label, color: fb.color },
      });
    }

    // Start/restart decay timer
    this.startDecay(actionId, ev, conn);
  }

  // --- Private helpers ---

  private startDecay(actionId: string, ev: DialRotateEvent, conn: ReturnType<typeof connectionManager.getConnection>): void {
    this.stopDecay(actionId);

    this.decayTimers.set(actionId, setInterval(() => {
      const current = (this.accumulatedTicks.get(actionId) ?? 0) * DECAY_RATE;
      this.accumulatedTicks.set(actionId, current);

      if (Math.abs(current) < STOP_THRESHOLD) {
        // Fully stopped
        this.accumulatedTicks.set(actionId, 0);
        this.isShuttling.set(actionId, false);
        this.stopDecay(actionId);
        conn.sendRemoteControl({ type: "shuttle_release" });

        if (ev.action.isDial()) {
          const isPlaying = this.playState.get(actionId) ?? false;
          const fb = shuttleFeedback(0, isPlaying);
          ev.action.setFeedback({
            shuttleValue: { value: fb.label, color: fb.color },
          });
        }
        return;
      }

      const displacement = ticksToDisplacement(current);
      conn.sendRemoteControl({ type: "shuttle_set", displacement });

      if (ev.action.isDial()) {
        const fb = shuttleFeedback(displacement);
        ev.action.setFeedback({
          shuttleValue: { value: fb.label, color: fb.color },
        });
      }
    }, DECAY_INTERVAL));
  }

  private stopDecay(actionId: string): void {
    const timer = this.decayTimers.get(actionId);
    if (timer) {
      clearInterval(timer);
      this.decayTimers.delete(actionId);
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
