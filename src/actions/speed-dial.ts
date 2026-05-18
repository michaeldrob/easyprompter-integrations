import {
  action,
  DialDownEvent,
  DialRotateEvent,
  SingletonAction,
  TouchTapEvent,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";

import { connectionManager } from "../connection-manager";
import type { EasyPrompterSettings, PrompterState } from "../types";

/**
 * Speed Dial action (Stream Deck+ encoder) — rotate to adjust speed,
 * press to reset speed, touch to toggle play/pause.
 */
@action({ UUID: "com.easyprompter.streamdeck.speed-dial" })
export class SpeedDial extends SingletonAction<EasyPrompterSettings> {
  private unsubscribers = new Map<string, () => void>();

  override async onWillAppear(
    ev: WillAppearEvent<EasyPrompterSettings>
  ): Promise<void> {
    const settings = ev.payload.settings;
    if (!settings.serverUrl) return;

    const conn = connectionManager.getConnection(settings.serverUrl);
    conn.connect();

    const unsubscribe = conn.onStateChange((state: PrompterState) => {
      // Update the encoder feedback with the current speed
      if (ev.action.isDial()) {
        ev.action.setFeedback({
          value: `${Math.round(state.speed)}%`,
          indicator: {
            value: Math.round(state.speed),
          },
        });
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

  override async onDialRotate(
    ev: DialRotateEvent<EasyPrompterSettings>
  ): Promise<void> {
    const settings = ev.payload.settings;
    if (!settings.serverUrl) return;

    const conn = connectionManager.getConnection(settings.serverUrl);
    const ticks = ev.payload.ticks;

    // Each tick adjusts speed — positive = faster, negative = slower
    if (ticks > 0) {
      for (let i = 0; i < ticks; i++) {
        conn.sendCommand("speed-up");
      }
    } else {
      for (let i = 0; i < Math.abs(ticks); i++) {
        conn.sendCommand("speed-down");
      }
    }
  }

  override async onDialDown(
    ev: DialDownEvent<EasyPrompterSettings>
  ): Promise<void> {
    const settings = ev.payload.settings;
    if (!settings.serverUrl) return;

    const conn = connectionManager.getConnection(settings.serverUrl);
    // Press the dial = reset speed to default
    conn.sendCommand("set-speed", { speed: 50 });
  }

  override async onTouchTap(
    ev: TouchTapEvent<EasyPrompterSettings>
  ): Promise<void> {
    const settings = ev.payload.settings;
    if (!settings.serverUrl) return;

    const conn = connectionManager.getConnection(settings.serverUrl);
    // Touch the strip = toggle playback
    conn.sendCommand("toggle-playback");
  }
}
