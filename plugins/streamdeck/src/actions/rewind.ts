import {
  action,
  KeyDownEvent,
  KeyUpEvent,
  SingletonAction,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager } from "../connection-manager";
import type { EasyPrompterSettings } from "../types";

/**
 * Rewind action — hold to shuttle backward at the configured scan speed.
 * Uses rewind_start/stop which properly saves and restores play state.
 * Scan speed is resolved by the operator's Controller Mapping setting.
 */
@action({ UUID: "com.easyprompter.streamdeck.rewind" })
export class Rewind extends SingletonAction {
  override async onWillAppear(): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;
    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();
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

    conn.sendRemoteControl({ type: "rewind_start" });
  }

  override async onKeyUp(
    ev: KeyUpEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    if (conn.connectionState !== "active") return;

    conn.sendRemoteControl({ type: "rewind_stop" });
  }
}
