import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager, SocketIOConnection } from "../connection-manager";
import type { ConnectionState, EasyPrompterSettings, SettingsData } from "../types";

/**
 * Blackout action — toggles teleprompter blackout mode.
 * Uses two states: state 0 = blackout off, state 1 = blackout on.
 */
@action({ UUID: "com.easyprompter.streamdeck.blackout" })
export class Blackout extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();
  private actionConnections = new Map<string, { conn: SocketIOConnection; ev: WillAppearEvent }>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settingsUnsub = streamDeck.settings.onDidReceiveGlobalSettings<EasyPrompterSettings>((event) => {
      this.setupConnection(ev, event.settings);
    });

    const unsubs = this.unsubscribers.get(ev.action.id) ?? [];
    unsubs.push(settingsUnsub.dispose.bind(settingsUnsub));
    this.unsubscribers.set(ev.action.id, unsubs);

    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    this.setupConnection(ev, settings);
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
      conn.onSettingsChange((data: SettingsData) => {
        if (ev.action.isKey()) {
          ev.action.setState(data.blackout ? 1 : 0);
          this.renderKey(ev, data.blackout ?? false);
        }
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (state !== "active" && ev.action.isKey()) {
          ev.action.setState(0);
        }
      })
    );

    this.unsubscribers.set(ev.action.id, unsubs);
    this.actionConnections.set(ev.action.id, { conn, ev });
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
  }

  override async onKeyDown(
    ev: KeyDownEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) {
      await ev.action.showAlert();
      return;
    }

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    if (conn.connectionState !== "active") {
      await ev.action.showAlert();
      return;
    }

    conn.sendRemoteControl({ type: "blackout_toggle" });
  }

  /**
   * Render the blackout key with a red background when active.
   */
  private renderKey(ev: WillAppearEvent, isBlackout: boolean): void {
    const bg = isBlackout ? "#cc2222" : "transparent";
    // Lucide eye / eye-off icon paths, scaled to fit 144x144 viewbox
    const iconPaths = isBlackout
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <line x1="1" y1="1" x2="23" y2="23" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="12" cy="12" r="3" stroke="white" stroke-width="1.5" fill="none"/>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="16" fill="${bg}"/>
  <g transform="translate(32, 32) scale(3.33)">
    ${iconPaths}
  </g>
</svg>`;

    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    ev.action.setImage(dataUri);
  }
}
