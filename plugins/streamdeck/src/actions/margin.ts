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
/** Max margin percentage treated as "full" for the visual bar. */
const MAX_MARGIN = 90;

/**
 * Generates an SVG data URI showing margin as two bars closing in from
 * both edges toward center. At MAX_MARGIN the bars nearly meet.
 *
 * Visual: ████░░░░░░░░░░████  (low margin)
 *         ██████████████████  (high margin, small gap)
 *
 * Matches the 168×10 pixmap rect in the layout.
 */
function marginBarSvg(margin: number, fillColor: string): string {
  const W = 168;
  const H = 10;
  const R = 4; // corner radius matching the rounded bar style
  const fraction = Math.min(1, Math.max(0, margin / MAX_MARGIN));
  // Each side fills half the bar width proportionally
  const fillW = Math.round((fraction * W) / 2);

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
    <rect x="0" y="0" width="${W}" height="${H}" rx="${R}" fill="#1a1a1a" stroke="#333333" stroke-width="1"/>
    ${fillW > 0 ? `<rect x="1" y="1" width="${fillW}" height="${H - 2}" rx="${Math.min(R, fillW)}" fill="${fillColor}"/>` : ""}
    ${fillW > 0 ? `<rect x="${W - 1 - fillW}" y="1" width="${fillW}" height="${H - 2}" rx="${Math.min(R, fillW)}" fill="${fillColor}"/>` : ""}
  </svg>`
  )}`
;
}

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

    // Capture initial per-action settings from the appear payload
    if (ev.payload.settings) {
      this.actionSettings.set(ev.action.id, ev.payload.settings as EncoderActionSettings);
    }

    const unsubs: (() => void)[] = [];
    let lastMargin: number | null = null;
    let barFillColor = "#00E5FF";

    unsubs.push(
      conn.onSettingsChange((data: SettingsData) => {
        if (ev.action.isDial()) {
          if (data.screenMargin != null) lastMargin = data.screenMargin;
          if (data.activeDisplayColor) barFillColor = data.activeDisplayColor;

          if (data.screenMargin != null || data.activeDisplayColor !== undefined) {
            if (lastMargin != null) {
              ev.action.setFeedback({
                icon: MARGIN_ICON,
                marginValue: `${lastMargin}%`,
                marginBar: marginBarSvg(lastMargin, barFillColor),
              });
            }
          }
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
