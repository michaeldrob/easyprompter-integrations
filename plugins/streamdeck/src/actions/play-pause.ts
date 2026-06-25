import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager, SocketIOConnection } from "../connection-manager";
import type { ConnectionState, EasyPrompterSettings, PrompterState } from "../types";

/**
 * Play/Pause action — toggles teleprompter playback.
 * Uses two states: state 0 = "will play" (show play icon), state 1 = "will pause" (show pause icon).
 */
@action({ UUID: "com.easyprompter.streamdeck.play-pause" })
export class PlayPause extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();
  /** Track the connection per action so we can re-subscribe on settings change */
  private actionConnections = new Map<string, { conn: SocketIOConnection; ev: WillAppearEvent }>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    // Subscribe to global settings changes to handle late configuration
    const settingsUnsub = streamDeck.settings.onDidReceiveGlobalSettings<EasyPrompterSettings>((event) => {
      this.setupConnection(ev, event.settings);
    });

    // Store the settings unsub so we clean up on disappear
    const unsubs = this.unsubscribers.get(ev.action.id) ?? [];
    unsubs.push(settingsUnsub.dispose.bind(settingsUnsub));
    this.unsubscribers.set(ev.action.id, unsubs);

    // Try to connect with current settings
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    this.setupConnection(ev, settings);
  }

  private setupConnection(ev: WillAppearEvent, settings: EasyPrompterSettings): void {
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    // If we already have listeners for this action+connection, skip
    const existing = this.actionConnections.get(ev.action.id);
    if (existing?.conn === conn) return;

    // Clean up old connection listeners if switching connections
    if (existing) {
      const oldUnsubs = this.unsubscribers.get(ev.action.id) ?? [];
      // Keep the settings unsub (first item), remove old connection unsubs
      const settingsUnsub = oldUnsubs[0];
      oldUnsubs.slice(1).forEach((fn) => fn());
      this.unsubscribers.set(ev.action.id, settingsUnsub ? [settingsUnsub] : []);
    }

    const unsubs = this.unsubscribers.get(ev.action.id) ?? [];

    unsubs.push(
      conn.onStateChange((state: PrompterState) => {
        // State 0 = stopped (show play icon), State 1 = playing (show pause icon)
        if (ev.action.isKey()) {
          ev.action.setState(state.isPlaying ? 1 : 0);
          this.renderKey(ev, state.isPlaying);
        }
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (state !== "active" && ev.action.isKey()) {
          ev.action.setState(0);
          this.renderKey(ev, false);
        }
      })
    );

    this.unsubscribers.set(ev.action.id, unsubs);
    this.actionConnections.set(ev.action.id, { conn, ev });

    // Sync initial state if available
    const currentState = conn.lastState;
    if (currentState && ev.action.isKey()) {
      ev.action.setState(currentState.isPlaying ? 1 : 0);
      this.renderKey(ev, currentState.isPlaying);
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

    conn.sendRemoteControl({ type: "play_pause" });
  }

  /**
   * Render green background when playing, reset to default when stopped.
   * Uses drawn SVG shapes (not embedded PNG) since SD supports that.
   */
  private renderKey(ev: WillAppearEvent, isPlaying: boolean): void {
    if (!isPlaying) {
      ev.action.setImage(undefined as unknown as string);
      return;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="16" fill="#1b8a2a"/>
  <circle cx="72" cy="72" r="40" stroke="white" stroke-width="3" fill="none"/>
  <rect x="58" y="54" width="9" height="36" rx="2" fill="white"/>
  <rect x="77" y="54" width="9" height="36" rx="2" fill="white"/>
</svg>`;

    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    ev.action.setImage(dataUri);
  }
}
