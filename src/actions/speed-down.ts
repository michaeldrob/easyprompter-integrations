import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
} from "@elgato/streamdeck";

import { connectionManager } from "../connection-manager";
import type { EasyPrompterSettings } from "../types";

/**
 * Speed Down action — decreases teleprompter scroll speed.
 */
@action({ UUID: "com.easyprompter.streamdeck.speed-down" })
export class SpeedDown extends SingletonAction<EasyPrompterSettings> {
  override async onWillAppear(
    ev: WillAppearEvent<EasyPrompterSettings>
  ): Promise<void> {
    const settings = ev.payload.settings;
    if (!settings.serverUrl) return;

    const conn = connectionManager.getConnection(settings.serverUrl);
    conn.connect();
  }

  override async onKeyDown(
    ev: KeyDownEvent<EasyPrompterSettings>
  ): Promise<void> {
    const settings = ev.payload.settings;
    if (!settings.serverUrl) {
      await ev.action.showAlert();
      return;
    }

    const conn = connectionManager.getConnection(settings.serverUrl);
    conn.sendCommand("speed-down");
  }
}
