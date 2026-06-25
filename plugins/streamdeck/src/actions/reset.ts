import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager } from "../connection-manager";
import type { EasyPrompterSettings } from "../types";

/**
 * Reset to Start action — resets the teleprompter to the beginning of the script.
 */
@action({ UUID: "com.easyprompter.streamdeck.reset" })
export class ResetToStart extends SingletonAction {
  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
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

    conn.sendRemoteControl({ type: "reset" });
  }
}
