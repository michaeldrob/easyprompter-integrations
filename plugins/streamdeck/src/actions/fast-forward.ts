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
 * Fast Forward action — hold to shuttle forward at the configured scan speed.
 * Uses fast_forward_start/stop which properly saves and restores play state.
 * Scan speed is resolved by the operator's Controller Mapping setting.
 */
@action({ UUID: "com.easyprompter.streamdeck.fast-forward" })
export class FastForward extends SingletonAction {
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

    conn.sendRemoteControl({ type: "fast_forward_start" });
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
