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
import { FONT_ICON } from "../icons/encoder-icons";
import { setBarColor } from "../layout-color";
import type { ConnectionState, EasyPrompterSettings, SettingsData } from "../types";


const FONT_SIZE_STEP = 2;

/**
 * Font Size action (Stream Deck+ encoder) — rotate to adjust font size,
 * press and touch are configurable via encoder action settings.
 */
@action({ UUID: "com.easyprompter.streamdeck.font-size" })
export class FontSize extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    if (ev.action.isDial()) {
      ev.action.setFeedback({ icon: FONT_ICON });
    }

    const unsubs: (() => void)[] = [];
    let lastFontSize: number | null = null;

    // DISABLED FOR TESTING — checking if settings feedback loop causes dial delay
    // unsubs.push(
    //   conn.onSettingsChange((data: SettingsData) => {
    //     if (ev.action.isDial()) {
    //       if (data.fontSize != null) lastFontSize = data.fontSize;
    //       let layoutChanged = false;
    //       if (data.activeDisplayColor !== undefined) {
    //         layoutChanged = setBarColor(ev.action, "font-layout", data.activeDisplayColor);
    //       }
    //       if (data.fontSize != null || data.activeDisplayColor !== undefined) {
    //         const applyFeedback = (): void => {
    //           if (lastFontSize != null) {
    //             ev.action.setFeedback({
    //               icon: FONT_ICON,
    //               fontValue: `${lastFontSize}px`,
    //               fontBar: Math.min(100, Math.max(0, Math.round(((lastFontSize - 14) / (180 - 14)) * 100))),
    //             });
    //           }
    //         };
    //         if (layoutChanged) {
    //           setTimeout(applyFeedback, 150);
    //         } else {
    //           applyFeedback();
    //         }
    //       }
    //     }
    //   })
    // );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (ev.action.isDial()) {
          if (state === "disconnected") {
            ev.action.setFeedback({ fontValue: "Offline" });
          } else if (state === "waiting") {
            ev.action.setFeedback({ fontValue: "Waiting..." });
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
    const delta = ticks * FONT_SIZE_STEP * stepSize;

    // DEBUG — timing trace (plugin-side)
    const pluginTs = Date.now();
    streamDeck.logger.info(`[TIMING] plugin: dial rotate delta=${delta} t=${pluginTs}`);
    conn.sendRemoteControl({ type: "font_size_step", delta });
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
