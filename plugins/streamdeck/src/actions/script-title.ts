import {
  action,
  DidReceiveSettingsEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager, SocketIOConnection } from "../connection-manager";
import type { ConnectionState, EasyPrompterSettings, ScriptInfo } from "../types";
import { brandLockupSvg } from "./brand-lockup";

/**
 * Script Title action — displays the current script title on the key.
 * Renders the full key face as SVG with word-wrapped title. Display-only, no key press action.
 */
@action({ UUID: "com.easyprompter.streamdeck.script-title" })
export class ScriptTitle extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();
  private actionConnections = new Map<string, { conn: SocketIOConnection; ev: WillAppearEvent }>();
  private lastScriptInfo = new Map<string, ScriptInfo>();
  private showBranding = new Map<string, boolean>();

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const actionSettings = (ev.payload.settings ?? {}) as Record<string, unknown>;
    this.showBranding.set(ev.action.id, actionSettings.showBranding !== false);

    if (ev.action.isKey()) {
      await this.renderKey(ev, "Script Title");
    }

    const settingsUnsub = streamDeck.settings.onDidReceiveGlobalSettings<EasyPrompterSettings>((event) => {
      this.setupConnection(ev, event.settings);
    });

    const unsubs = this.unsubscribers.get(ev.action.id) ?? [];
    unsubs.push(settingsUnsub.dispose.bind(settingsUnsub));
    this.unsubscribers.set(ev.action.id, unsubs);

    const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    this.setupConnection(ev, settings);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent
  ): Promise<void> {
    const actionSettings = (ev.payload.settings ?? {}) as Record<string, unknown>;
    this.showBranding.set(ev.action.id, actionSettings.showBranding !== false);

    // Re-render with last known data
    const cached = this.lastScriptInfo.get(ev.action.id);
    const entry = this.actionConnections.get(ev.action.id);
    if (entry && entry.ev.action.isKey()) {
      await this.renderKey(entry.ev, cached?.scriptTitle ?? "Script Title");
    }
  }

  private setupConnection(ev: WillAppearEvent, settings: EasyPrompterSettings): void {
    if (!settings.serverUrl || !settings.apiKey) return;

    const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
    conn.connect();

    const existing = this.actionConnections.get(ev.action.id);
    if (existing?.conn === conn) return;

    // Clean up old connection listeners if switching connections
    if (existing) {
      const oldUnsubs = this.unsubscribers.get(ev.action.id) ?? [];
      const settingsUnsub = oldUnsubs[0];
      oldUnsubs.slice(1).forEach((fn) => fn());
      this.unsubscribers.set(ev.action.id, settingsUnsub ? [settingsUnsub] : []);
    }

    const unsubs = this.unsubscribers.get(ev.action.id) ?? [];

    unsubs.push(
      conn.onScriptInfoChange((data: ScriptInfo) => {
        if (!ev.action.isKey()) return;
        this.lastScriptInfo.set(ev.action.id, data);
        this.renderKey(ev, data.scriptTitle ?? "Script Title");
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (state !== "active" && ev.action.isKey()) {
          this.renderKey(ev, "Script Title");
          this.lastScriptInfo.delete(ev.action.id);
        }
      })
    );

    this.unsubscribers.set(ev.action.id, unsubs);
    this.actionConnections.set(ev.action.id, { conn, ev });
  }

  /**
   * Word-wrap text into lines of approximately maxCharsPerLine characters.
   * Returns at most maxLines lines.
   */
  private wrapText(text: string, maxCharsPerLine: number = 10, maxLines: number = 3): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if (lines.length >= maxLines) break;

      if (currentLine.length === 0) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    // Push the last line if we haven't exceeded maxLines
    if (currentLine.length > 0 && lines.length < maxLines) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Render the full key face as SVG with EP brand lockup and word-wrapped title.
   */
  private async renderKey(
    ev: WillAppearEvent,
    title: string
  ): Promise<void> {
    const lines = this.wrapText(title);
    const lineSpacing = 18;
    const startY = 70;

    const titleTspans = lines
      .map((line, i) => {
        const y = startY + i * lineSpacing;
        return `<text x="72" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#ffffff">${this.escapeXml(line)}</text>`;
      })
      .join("\n  ");

    const branding = this.showBranding.get(ev.action.id) !== false;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  ${brandLockupSvg(branding)}
  ${titleTspans}
</svg>`;

    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    if (ev.action.isKey()) {
      ev.action.setTitle("");
      ev.action.setImage(dataUri);
    }
  }

  /** Escape special XML characters in user-provided text. */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  override async onWillDisappear(
    ev: WillDisappearEvent
  ): Promise<void> {
    const unsubs = this.unsubscribers.get(ev.action.id);
    if (unsubs) {
      unsubs.forEach((fn) => fn());
      this.unsubscribers.delete(ev.action.id);
    }
    this.actionConnections.delete(ev.action.id);
    this.lastScriptInfo.delete(ev.action.id);
    this.showBranding.delete(ev.action.id);
  }
}
