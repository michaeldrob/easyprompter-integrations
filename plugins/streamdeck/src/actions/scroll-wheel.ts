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
import { SCROLL_ICON, SCROLL_UP_ICON, SCROLL_DOWN_ICON } from "../icons/encoder-icons";
import type { ConnectionState, EasyPrompterSettings, PrompterState } from "../types";

/** How long (ms) after the last rotation before the chevron disappears. */
const CHEVRON_TIMEOUT = 1000;

/** Transparent 1×1 SVG to clear a pixmap slot. */
const EMPTY_PIXMAP = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'
)}`;

/**
 * Scroll Wheel action (Stream Deck+ encoder) — rotate to scroll
 * through the script like a mouse wheel. Press and touch are configurable.
 */
@action({ UUID: "com.easyprompter.streamdeck.scroll-wheel" })
export class ScrollWheel extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();
  private chevronTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private actionRefs = new Map<string, WillAppearEvent["action"]>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    if (ev.action.isDial()) {
      this.actionRefs.set(ev.action.id, ev.action);
      ev.action.setFeedback({ icon: SCROLL_ICON, directionIcon: EMPTY_PIXMAP });
    }

    // Capture initial per-action settings from the appear payload
    if (ev.payload.settings) {
      this.encoderSettings.set(ev.action.id, ev.payload.settings as EncoderActionSettings);
    }

    const unsubs: (() => void)[] = [];

    unsubs.push(
      conn.onStateChange((_state: PrompterState) => {
        if (ev.action.isDial()) {
          ev.action.setFeedback({ directionIcon: EMPTY_PIXMAP });
        }
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (ev.action.isDial()) {
          if (state === "disconnected" || state === "waiting") {
            ev.action.setFeedback({ directionIcon: EMPTY_PIXMAP });
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
    this.clearChevronTimer(ev.action.id);
    this.actionRefs.delete(ev.action.id);
    this.encoderSettings.delete(ev.action.id);
  }

  override async onDialRotate(
    ev: DialRotateEvent
  ): Promise<void> {
    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    if (conn.connectionState !== "active") return;

    const ticks = ev.payload.ticks;
    const direction: 1 | -1 = ticks > 0 ? 1 : -1;
    const stepSize = parseInt(String(this.encoderSettings.get(ev.action.id)?.stepSize), 10) || 1;
    const magnitude = Math.min(Math.abs(ticks), 5) * stepSize;

    conn.sendRemoteControl({ type: "jog_tick", direction, magnitude });

    // Show directional chevron
    if (ev.action.isDial()) {
      const chevron = direction > 0 ? SCROLL_DOWN_ICON : SCROLL_UP_ICON;
      ev.action.setFeedback({ directionIcon: chevron });

      // Clear chevron after timeout
      const actionId = ev.action.id;
      this.clearChevronTimer(actionId);
      this.chevronTimers.set(actionId, setTimeout(() => {
        const actionRef = this.actionRefs.get(actionId);
        if (actionRef?.isDial()) {
          actionRef.setFeedback({ directionIcon: EMPTY_PIXMAP });
        }
        this.chevronTimers.delete(actionId);
      }, CHEVRON_TIMEOUT));
    }
  }

  private clearChevronTimer(actionId: string): void {
    const timer = this.chevronTimers.get(actionId);
    if (timer) {
      clearTimeout(timer);
      this.chevronTimers.delete(actionId);
    }
  }

  private encoderSettings = new Map<string, EncoderActionSettings>();

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    this.encoderSettings.set(ev.action.id, ev.payload.settings as EncoderActionSettings);
  }

  override async onDialDown(ev: DialDownEvent): Promise<void> {
    const settings = this.encoderSettings.get(ev.action.id);
    await executeEncoderAction(settings?.pressAction ?? "none");
  }

  override async onTouchTap(ev: TouchTapEvent): Promise<void> {
    const settings = this.encoderSettings.get(ev.action.id);
    await executeEncoderAction(settings?.touchAction ?? "none");
  }
}
