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
import { LINE_HEIGHT_ICON } from "../icons/encoder-icons";
import type { ConnectionState, EasyPrompterSettings, SettingsData } from "../types";


const LINE_HEIGHT_STEP = 10;

/**
 * Line Height action (Stream Deck+ encoder) — rotate to adjust line height,
 * press and touch are configurable via encoder action settings.
 */
@action({ UUID: "com.easyprompter.streamdeck.line-height" })
export class LineHeight extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    if (ev.action.isDial()) {
      ev.action.setFeedback({ icon: LINE_HEIGHT_ICON });
    }

    const unsubs: (() => void)[] = [];

    unsubs.push(
      conn.onSettingsChange((data: SettingsData) => {
        if (ev.action.isDial() && data.lineHeight != null) {
          ev.action.setFeedback({
            lineHeightValue: `${data.lineHeight}%`,
            lineHeightBar: Math.min(100, Math.max(0, Math.round(((data.lineHeight - 100) / (300 - 100)) * 100))),
          });
        }
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (ev.action.isDial()) {
          if (state === "disconnected") {
            ev.action.setFeedback({ lineHeightValue: "Offline" });
          } else if (state === "waiting") {
            ev.action.setFeedback({ lineHeightValue: "Waiting..." });
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
  }

  override async onDialRotate(
    ev: DialRotateEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    if (conn.connectionState !== "active") return;

    const ticks = ev.payload.ticks;
    const stepSize = parseInt(String(this.actionSettings.get(ev.action.id)?.stepSize), 10) || 1;
    const delta = ticks * LINE_HEIGHT_STEP * stepSize;

    conn.sendRemoteControl({ type: "line_height_step", delta });
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
