import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  KeyUpEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager } from "../connection-manager";
import type { EasyPrompterSettings, ShuttleActionSettings } from "../types";

/**
 * Fast Forward action — hold to shuttle forward at a configurable rate.
 * Uses fast_forward_start/stop which properly saves and restores play state.
 * Rate is configurable per-tile via the Property Inspector.
 */
@action({ UUID: "com.easyprompter.streamdeck.fast-forward" })
export class FastForward extends SingletonAction {
  private shuttleRates = new Map<string, number>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const actionSettings = ev.payload.settings as ShuttleActionSettings;
    this.shuttleRates.set(ev.action.id, actionSettings.shuttleRate ?? 1.0);

    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;
    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent
  ): Promise<void> {
    const actionSettings = ev.payload.settings as ShuttleActionSettings;
    this.shuttleRates.set(ev.action.id, actionSettings.shuttleRate ?? 1.0);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent
  ): Promise<void> {
    this.shuttleRates.delete(ev.action.id);
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

    const rate = this.shuttleRates.get(ev.action.id) ?? 1.0;
    conn.sendRemoteControl({ type: "fast_forward_start", displacement: rate });
  }

  override async onKeyUp(
    ev: KeyUpEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    if (conn.connectionState !== "active") return;

    conn.sendRemoteControl({ type: "fast_forward_stop" });
  }
}
