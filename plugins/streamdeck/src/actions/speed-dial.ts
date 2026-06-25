import {
  action,
  DialDownEvent,
  DialRotateEvent,
  DidReceiveSettingsEvent,
  SingletonAction,
  TouchTapEvent,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import { executeEncoderAction, type EncoderActionSettings } from "./encoder-actions";
import streamDeck from "@elgato/streamdeck";

import { connectionManager } from "../connection-manager";
import { SPEED_ICON } from "../icons/encoder-icons";
import type { ConnectionState, EasyPrompterSettings, PrompterState } from "../types";

const SPEED_STEP = 5;
const MIN_SPEED = 10;
const MAX_SPEED = 160;

/**
 * Speed Dial action (Stream Deck+ encoder) — rotate to adjust speed,
 * press to reset, touch to toggle play/pause.
 */
@action({ UUID: "com.easyprompter.streamdeck.speed-dial" })
export class SpeedDial extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    // Inject full-bleed SVG icon into the layout pixmap
    if (ev.action.isDial()) {
      ev.action.setFeedback({ icon: SPEED_ICON });
    }

    const unsubs: (() => void)[] = [];

    unsubs.push(
      conn.onStateChange((state: PrompterState) => {
        // Update the encoder feedback with the current speed
        if (ev.action.isDial()) {
          ev.action.setFeedback({
            speedValue: `${Math.round(state.speed)}`,
            speedBar: Math.min(100, Math.max(0, Math.round(((state.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100))),
          });
        }
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (ev.action.isDial()) {
          if (state === "disconnected") {
            ev.action.setFeedback({ speedValue: "Offline" });
          } else if (state === "waiting") {
            ev.action.setFeedback({ speedValue: "Waiting..." });
          }
        }
      })
    );

    this.unsubscribers.set(ev.action.id, unsubs);
  }

  override async onWillDisappear(
    ev: WillDisappearEvent
  ): Promise<void> {
    const unsubs = this.unsubscribers.get(ev.action.id);
    if (unsubs) {
      unsubs.forEach((fn) => fn());
      this.unsubscribers.delete(ev.action.id);
    }
    this.actionSettings.delete(ev.action.id);
  }

  override async onDialRotate(
    ev: DialRotateEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    if (conn.connectionState !== "active") return;

    const currentSpeed = conn.lastState?.speed;
    if (currentSpeed == null) return;

    const ticks = ev.payload.ticks;
    const stepSize = parseInt(String(this.actionSettings.get(ev.action.id)?.stepSize), 10) || 1;
    const newSpeed = Math.min(
      MAX_SPEED,
      Math.max(MIN_SPEED, currentSpeed + ticks * SPEED_STEP * stepSize)
    );

    conn.sendRemoteControl({ type: "set_speed", speedWpm: newSpeed });
  }

  private actionSettings = new Map<string, EncoderActionSettings>();

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    this.actionSettings.set(ev.action.id, ev.payload.settings as EncoderActionSettings);
  }

  override async onDialDown(ev: DialDownEvent): Promise<void> {
    const settings = this.actionSettings.get(ev.action.id);
    await executeEncoderAction(settings?.pressAction ?? "none");
  }

  override async onTouchTap(ev: TouchTapEvent): Promise<void> {
    const settings = this.actionSettings.get(ev.action.id);
    await executeEncoderAction(settings?.touchAction ?? "none");
  }
}
