import {
  action,
  DidReceiveSettingsEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager, SocketIOConnection } from "../connection-manager";
import type { ConnectionState, EasyPrompterSettings, TimerData } from "../types";
import { brandLockupSvg } from "./brand-lockup";

/**
 * Progress action — displays teleprompter scroll progress as a percentage.
 * Renders the full key face as SVG. Display-only, no key press action.
 */
@action({ UUID: "com.easyprompter.streamdeck.progress" })
export class Progress extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();
  private actionConnections = new Map<string, { conn: SocketIOConnection; ev: WillAppearEvent }>();
  private lastTimerData = new Map<string, TimerData>();
  private showBranding = new Map<string, boolean>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const actionSettings = (ev.payload.settings ?? {}) as Record<string, unknown>;
    this.showBranding.set(ev.action.id, actionSettings.showBranding !== false);

    if (ev.action.isKey()) {
      await this.renderKey(ev, 0);
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
    const actionSettings = (ev.payload.settings ?? {}) as Record<string, unknown>;
    this.showBranding.set(ev.action.id, actionSettings.showBranding !== false);

    // Re-render with last known data
    const cached = this.lastTimerData.get(ev.action.id);
    const entry = this.actionConnections.get(ev.action.id);
    if (cached && entry && entry.ev.action.isKey()) {
      await this.renderKey(entry.ev, cached.progress ?? 0);
    }
  }

  private setupConnection(ev: WillAppearEvent, settings: EasyPrompterSettings): void {
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    const existing = this.actionConnections.get(ev.action.id);
    if (existing?.conn === conn) return;

    // Clean up old connection listeners if switching connections
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
        this.renderKey(ev, data.progress ?? 0);
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (state !== "active" && ev.action.isKey()) {
          this.renderKey(ev, 0);
          this.lastTimerData.delete(ev.action.id);
        }
      })
    );

    this.unsubscribers.set(ev.action.id, unsubs);
    this.actionConnections.set(ev.action.id, { conn, ev });

    // Sync initial state if available
    const lastTimer = conn.lastTimer;
    if (lastTimer && ev.action.isKey()) {
      this.lastTimerData.set(ev.action.id, lastTimer);
      this.renderKey(ev, lastTimer.progress ?? 0);
    }
  }

  /**
   * Render the full key face as SVG with EP brand lockup and progress percentage.
   */
  private async renderKey(
    ev: WillAppearEvent,
    progress: number
  ): Promise<void> {
    const pct = Math.round(progress);

    const branding = this.showBranding.get(ev.action.id) !== false;
    const textY = branding ? 90 : 72;
    const barY = branding ? 110 : 92;
    const barWidth = 108;
    const barX = (144 - barWidth) / 2;
    const fillWidth = Math.round((pct / 100) * barWidth);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  ${brandLockupSvg(branding)}
  <text x="72" y="${textY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#00e5ff">${pct}%</text>
  <rect x="${barX}" y="${barY}" width="${barWidth}" height="10" rx="5" fill="#333333"/>
  <rect x="${barX}" y="${barY}" width="${fillWidth}" height="10" rx="5" fill="#00e5ff"/>
</svg>`;

    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    if (ev.action.isKey()) {
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
    this.lastTimerData.delete(ev.action.id);
    this.showBranding.delete(ev.action.id);
  }
}
