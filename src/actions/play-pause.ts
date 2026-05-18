import {
  action,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";

import { connectionManager } from "../connection-manager";
import type { EasyPrompterSettings, PrompterState } from "../types";

/**
 * Play/Pause action — toggles teleprompter playback.
 * Uses two states: state 0 = "will play" (show play icon), state 1 = "will pause" (show pause icon).
 */
@action({ UUID: "com.easyprompter.streamdeck.play-pause" })
export class PlayPause extends SingletonAction<EasyPrompterSettings> {
  private unsubscribers = new Map<string, () => void>();

  override async onWillAppear(
    ev: WillAppearEvent<EasyPrompterSettings>
  ): Promise<void> {
    const settings = ev.payload.settings;
    if (!settings.serverUrl) return;

    const conn = connectionManager.getConnection(settings.serverUrl);
    conn.connect();

    const unsubscribe = conn.onStateChange((state: PrompterState) => {
      // State 0 = stopped (show play icon), State 1 = playing (show pause icon)
      if (ev.action.isKey()) {
        ev.action.setState(state.isPlaying ? 1 : 0);
      }
    });

    this.unsubscribers.set(ev.action.id, unsubscribe);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent<EasyPrompterSettings>
  ): Promise<void> {
    const unsubscribe = this.unsubscribers.get(ev.action.id);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribers.delete(ev.action.id);
    }
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
    conn.sendCommand("toggle-playback");
  }
}
