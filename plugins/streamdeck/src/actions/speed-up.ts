import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager } from "../connection-manager";
import { queueSpeedChange } from "../speed-debounce";
import type { EasyPrompterSettings } from "../types";

const SPEED_STEP = 5;

/**
 * Speed Up action — increases teleprompter scroll speed.
 * Uses debounced batching so rapid presses accumulate correctly.
 */
@action({ UUID: "com.easyprompter.streamdeck.speed-up" })
export class SpeedUp extends SingletonAction {
  private actionSettings = new Map<string, Record<string, unknown>>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;
    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    this.actionSettings.set(ev.action.id, ev.payload.settings as Record<string, unknown>);
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

    const stepSize = parseInt(String(this.actionSettings.get(ev.action.id)?.stepSize), 10) || 1;
    queueSpeedChange(SPEED_STEP * stepSize);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent
  ): Promise<void> {
    this.actionSettings.delete(ev.action.id);
  }
}
