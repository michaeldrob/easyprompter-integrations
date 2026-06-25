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
import { MARGIN_ICON } from "../icons/encoder-icons";
import type { ConnectionState, EasyPrompterSettings, SettingsData } from "../types";


const MARGIN_STEP = 5;

/**
 * Margin action (Stream Deck+ encoder) — rotate to adjust screen margin,
 * press and touch are configurable via encoder action settings.
 */
@action({ UUID: "com.easyprompter.streamdeck.margin" })
export class MarginAction extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    if (ev.action.isDial()) {
      ev.action.setFeedback({ icon: MARGIN_ICON });
    }

    const unsubs: (() => void)[] = [];

    unsubs.push(
      conn.onSettingsChange((data: SettingsData) => {
        if (ev.action.isDial() && data.screenMargin != null) {
          ev.action.setFeedback({
            marginValue: `${data.screenMargin}%`,
            marginBar: Math.min(100, Math.max(0, Math.round((data.screenMargin / 90) * 100))),
          });
        }
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (ev.action.isDial()) {
          if (state === "disconnected") {
            ev.action.setFeedback({ marginValue: "Offline" });
          } else if (state === "waiting") {
            ev.action.setFeedback({ marginValue: "Waiting..." });
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
    const delta = ticks * MARGIN_STEP * stepSize;

    conn.sendRemoteControl({ type: "margin_step", delta });
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
