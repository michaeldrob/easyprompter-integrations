import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager, SocketIOConnection } from "../connection-manager";
import type { ConnectionState, EasyPrompterSettings, TimerData } from "../types";
import { brandLockupSvg } from "./brand-lockup";

type TimerMode = "elapsed" | "remaining";

interface TimerActionSettings {
  timerMode?: TimerMode;
  showBranding?: boolean;
  [key: string]: unknown;
}

/**
 * Timer action — displays elapsed or remaining session time on the key.
 * Renders the full key face as SVG for independent sizing of arrow vs text.
 */
@action({ UUID: "com.easyprompter.streamdeck.timer" })
export class Timer extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();
  private actionConnections = new Map<string, { conn: SocketIOConnection; ev: WillAppearEvent }>();
  private timerModes = new Map<string, TimerMode>();
  private lastTimerData = new Map<string, TimerData>();
  private showBranding = new Map<string, boolean>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const actionSettings = ev.payload.settings as TimerActionSettings;
    this.timerModes.set(ev.action.id, actionSettings.timerMode ?? "elapsed");
    this.showBranding.set(ev.action.id, actionSettings.showBranding !== false);

    if (ev.action.isKey()) {
      const mode = this.timerModes.get(ev.action.id) ?? "elapsed";
      await this.renderKey(ev, "00:00", mode);
    }

    const settingsUnsub = streamDeck.settings.onDidReceiveGlobalSettings<EasyPrompterSettings>((event) => {
      this.setupConnection(ev, event.settings);
    });

    const unsubs = this.unsubscribers.get(ev.action.id) ?? [];
    unsubs.push(settingsUnsub.dispose.bind(settingsUnsub));
    this.unsubscribers.set(ev.action.id, unsubs);

    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    this.setupConnection(ev, settings);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent
  ): Promise<void> {
    const actionSettings = ev.payload.settings as TimerActionSettings;
    this.timerModes.set(ev.action.id, actionSettings.timerMode ?? "elapsed");
    this.showBranding.set(ev.action.id, actionSettings.showBranding !== false);

    // Re-render with last known data (or default)
    const entry = this.actionConnections.get(ev.action.id);
    if (entry && entry.ev.action.isKey()) {
      const mode = this.timerModes.get(ev.action.id) ?? "elapsed";
      const cached = this.lastTimerData.get(ev.action.id);
      if (cached) {
        const raw = mode === "remaining" ? cached.remaining : cached.elapsed;
        const { text, hasHours } = this.formatTime(raw);
        this.renderKey(entry.ev, text, mode, hasHours);
      } else {
        this.renderKey(entry.ev, "00:00", mode);
      }
    }
  }

  private setupConnection(ev: WillAppearEvent, settings: EasyPrompterSettings): void {
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    const existing = this.actionConnections.get(ev.action.id);
    if (existing?.conn === conn) return;

    if (existing) {
      const oldUnsubs = this.unsubscribers.get(ev.action.id) ?? [];
      const settingsUnsub = oldUnsubs[0];
      oldUnsubs.slice(1).forEach((fn) => fn());
      this.unsubscribers.set(ev.action.id, settingsUnsub ? [settingsUnsub] : []);
    }

    const unsubs = this.unsubscribers.get(ev.action.id) ?? [];

    unsubs.push(
      conn.onTimerChange((data: TimerData) => {
        if (!ev.action.isKey()) return;
        this.lastTimerData.set(ev.action.id, data);
        const mode = this.timerModes.get(ev.action.id) ?? "elapsed";
        const raw = mode === "remaining" ? data.remaining : data.elapsed;
        const { text, hasHours } = this.formatTime(raw);
        this.renderKey(ev, text, mode, hasHours);
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (state !== "active" && ev.action.isKey()) {
          const mode = this.timerModes.get(ev.action.id) ?? "elapsed";
          this.renderKey(ev, "00:00", mode);
          this.lastTimerData.delete(ev.action.id);
        }
      })
    );

    this.unsubscribers.set(ev.action.id, unsubs);
    this.actionConnections.set(ev.action.id, { conn, ev });

    const lastTimer = conn.lastTimer;
    if (lastTimer && ev.action.isKey()) {
      this.lastTimerData.set(ev.action.id, lastTimer);
      const mode = this.timerModes.get(ev.action.id) ?? "elapsed";
      const raw = mode === "remaining" ? lastTimer.remaining : lastTimer.elapsed;
      const { text, hasHours } = this.formatTime(raw);
      this.renderKey(ev, text, mode, hasHours);
    }
  }

  /**
   * Format time for display.
   * Under 1 hour: "MM:SS" (strip leading "00:").
   * 1 hour or more: keep full "HH:MM:SS".
   */
  private formatTime(timeStr?: string): { text: string; hasHours: boolean } {
    if (!timeStr) return { text: "00:00", hasHours: false };
    if (timeStr.startsWith("00:")) return { text: timeStr.slice(3), hasHours: false };
    return { text: timeStr, hasHours: true };
  }

  /**
   * Render the full key face as SVG with:
   * - EP brand lockup at top
   * - Thin arrow (↑/↓) at smaller size + time text at larger size
   */
  private async renderKey(
    ev: WillAppearEvent | DidReceiveSettingsEvent | KeyDownEvent,
    time: string,
    mode: TimerMode,
    hasHours: boolean = false
  ): Promise<void> {
    // +/- broadcast convention: + = elapsed (counting up), - = remaining (counting down)
    const sign = mode === "remaining" ? "−" : "+";

    const branding = this.showBranding.get(ev.action.id) !== false;

    // Shrink font when showing HH:MM:SS so it fits the key
    const timeFontSize = hasHours ? 24 : 34;
    const signFontSize = hasHours ? 20 : 28;
    const timeX = hasHours ? 24 : 32;
    const signX = hasHours ? 4 : 10;
    // When branding is hidden, shift text up to vertically center
    const timeY = branding ? (hasHours ? 103 : 105) : (hasHours ? 82 : 84);
    const signY = branding ? (hasHours ? 101 : 102) : (hasHours ? 80 : 81);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  ${brandLockupSvg(branding)}
  <text x="${signX}" y="${signY}" font-family="Arial, Helvetica, sans-serif" font-size="${signFontSize}" font-weight="200" fill="#00e5ff">${sign}</text>
  <text x="${timeX}" y="${timeY}" font-family="Arial, Helvetica, sans-serif" font-size="${timeFontSize}" fill="#00e5ff">${time}</text>
</svg>`;

    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    if (ev.action.isKey()) {
      // Clear title since we render everything in the image
      ev.action.setTitle("");
      ev.action.setImage(dataUri);
    }
  }

  override async onWillDisappear(
    ev: WillDisappearEvent
  ): Promise<void> {
    const unsubs = this.unsubscribers.get(ev.action.id);
    if (unsubs) {
      unsubs.forEach((fn) => fn());
      this.unsubscribers.delete(ev.action.id);
    }
    this.actionConnections.delete(ev.action.id);
    this.timerModes.delete(ev.action.id);
    this.lastTimerData.delete(ev.action.id);
    this.showBranding.delete(ev.action.id);
  }

  override async onKeyDown(
    ev: KeyDownEvent
  ): Promise<void> {
    const current = this.timerModes.get(ev.action.id) ?? "elapsed";
    const next: TimerMode = current === "elapsed" ? "remaining" : "elapsed";
    this.timerModes.set(ev.action.id, next);

    await ev.action.setSettings({ timerMode: next });

    const cached = this.lastTimerData.get(ev.action.id);
    if (cached && ev.action.isKey()) {
      const raw = next === "remaining" ? cached.remaining : cached.elapsed;
      const { text, hasHours } = this.formatTime(raw);
      this.renderKey(ev, text, next, hasHours);
    }
  }
}
