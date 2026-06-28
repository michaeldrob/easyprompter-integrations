import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { connectionManager, SocketIOConnection } from "../connection-manager";
import type { ConnectionState, EasyPrompterSettings, ScriptInfo } from "../types";

/** Per-action settings for a Load Script button. */
interface LoadScriptSettings {
  scriptId?: string;
  scriptLabel?: string;
  titleFontSize?: number;
  [key: string]: unknown;
}

/**
 * Load Script action — switches the teleprompter to a specific script.
 * Users can add this button multiple times, each configured for a different script.
 * The button shows "LOAD" header + script label, and highlights green when active.
 */
@action({ UUID: "com.easyprompter.streamdeck.load-script" })
export class LoadScript extends SingletonAction {
  private unsubscribers = new Map<string, (() => void)[]>();
  private actionConnections = new Map<string, { conn: SocketIOConnection; ev: WillAppearEvent }>();
  private actionSettings = new Map<string, LoadScriptSettings>();
  private isActiveScript = new Map<string, boolean>();
  private isLoading = new Map<string, boolean>();
  private isWarning = new Map<string, boolean>();
  private loadingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private warningTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  /** Cached script list for title→ID resolution when server omits scriptId */
  private cachedScripts: { id: string; title: string }[] = [];


  /**
   * Resolve scriptId from a ScriptInfo object.
   * Uses data.scriptId directly if available; falls back to title→ID lookup.
   */
  private resolveScriptId(data: ScriptInfo): string | undefined {
    if (data.scriptId) return data.scriptId;
    if (data.scriptTitle) {
      const match = this.cachedScripts.find((s) => s.title === data.scriptTitle);
      return match?.id;
    }
    return undefined;
  }

  /**
   * Fetch scripts from the API for title→ID resolution.
   */
  private async fetchScripts(serverUrl: string, apiKey: string): Promise<void> {
    try {
      const url = serverUrl.replace(/\/+$/, "") + "/api/remote-keys/scripts";
      const resp = await fetch(url, { headers: { Authorization: "Bearer " + apiKey } });
      if (!resp.ok) return;
      const data = await resp.json() as { scripts: { id: string; title: string }[] };
      this.cachedScripts = data.scripts || [];

      // Re-check active state for all actions after fetching scripts
      for (const [actionId, entry] of this.actionConnections) {
        const lastInfo = entry.conn.lastScriptInfo;
        const settings = this.actionSettings.get(actionId);
        if (lastInfo && settings?.scriptId) {
          const resolvedId = this.resolveScriptId(lastInfo);
          const isActive = resolvedId === settings.scriptId;
          const wasActive = this.isActiveScript.get(actionId) ?? false;
          this.isActiveScript.set(actionId, isActive);
          if (isActive !== wasActive && entry.ev.action.isKey()) {
            this.renderKey(entry.ev, settings.scriptLabel || settings.scriptId || "No Script", isActive, false);
          }
        }
      }
    } catch {
      // Silently ignore fetch errors
    }


  }

  override async onWillAppear(
    ev: WillAppearEvent
  ): Promise<void> {
    const settings = (ev.payload.settings ?? {}) as LoadScriptSettings;
    this.actionSettings.set(ev.action.id, settings);
    this.isActiveScript.set(ev.action.id, false);

    if (ev.action.isKey()) {
      await this.renderKey(ev, settings.scriptLabel || settings.scriptId || "No Script", false, false);
    }

    const settingsUnsub = streamDeck.settings.onDidReceiveGlobalSettings<EasyPrompterSettings>((event) => {
      this.setupConnection(ev, event.settings);
    });

    const unsubs = this.unsubscribers.get(ev.action.id) ?? [];
    unsubs.push(settingsUnsub.dispose.bind(settingsUnsub));
    this.unsubscribers.set(ev.action.id, unsubs);

    const globalSettings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    this.setupConnection(ev, globalSettings);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent
  ): Promise<void> {
    const settings = (ev.payload.settings ?? {}) as LoadScriptSettings;
    this.actionSettings.set(ev.action.id, settings);

    // Check if this is the active script
    const entry = this.actionConnections.get(ev.action.id);
    if (entry) {
      const lastInfo = entry.conn.lastScriptInfo;
      const resolvedId = lastInfo ? this.resolveScriptId(lastInfo) : undefined;
      const isActive = !!(settings.scriptId && resolvedId === settings.scriptId);
      this.isActiveScript.set(ev.action.id, isActive);
    }

    if (ev.action.isKey()) {
      const active = this.isActiveScript.get(ev.action.id) ?? false;
      // Use a proxy WillAppearEvent-like object for renderKey
      await this.renderKeyFromSettings(ev.action.id, settings, active);
    }
  }

  private setupConnection(ev: WillAppearEvent, globalSettings: EasyPrompterSettings): void {
    if (!globalSettings.serverUrl || !globalSettings.apiKey) return;

    const conn = connectionManager.getConnection(globalSettings.serverUrl, globalSettings.apiKey);
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
        const settings = this.actionSettings.get(ev.action.id);
        const resolvedId = this.resolveScriptId(data);
        const isActive = !!(settings?.scriptId && resolvedId === settings.scriptId);
        const wasActive = this.isActiveScript.get(ev.action.id) ?? false;
        const wasLoading = this.isLoading.get(ev.action.id) ?? false;
        this.isActiveScript.set(ev.action.id, isActive);

        if (wasLoading) {
          if (isActive) {
            // Our script confirmed loaded → green
            this.clearLoading(ev.action.id);
            this.renderKey(ev, settings?.scriptLabel || settings?.scriptId || "No Script", true, false);
          } else if (resolvedId) {
            // A different script was definitively loaded → our switch was superseded → cyan
            this.clearLoading(ev.action.id);
            this.renderKey(ev, settings?.scriptLabel || settings?.scriptId || "No Script", false, false);
          }
          // else: no definitive scriptId yet (intermediate update) → stay orange
          return;
        }

        // Normal (non-loading) state: re-render if active state changed
        if (isActive !== wasActive) {
          this.renderKey(ev, settings?.scriptLabel || settings?.scriptId || "No Script", isActive, false);
        }
      })
    );

    unsubs.push(
      conn.onConnectionStateChange((state: ConnectionState) => {
        if (state !== "active" && ev.action.isKey()) {
          this.isActiveScript.set(ev.action.id, false);
          this.clearLoading(ev.action.id);
          this.isWarning.set(ev.action.id, false);
          this.clearWarningTimeout(ev.action.id);
          const settings = this.actionSettings.get(ev.action.id);
          this.renderKey(ev, settings?.scriptLabel || settings?.scriptId || "No Script", false, false);
        }
      })
    );

    unsubs.push(
      conn.onScriptsChanged(() => {
        this.fetchScripts(globalSettings.serverUrl, globalSettings.apiKey);
      })
    );

    this.unsubscribers.set(ev.action.id, unsubs);
    this.actionConnections.set(ev.action.id, { conn, ev });

    // Fetch scripts for title→ID resolution
    this.fetchScripts(globalSettings.serverUrl, globalSettings.apiKey);

    // Sync initial state
    const lastInfo = conn.lastScriptInfo;
    const settings = this.actionSettings.get(ev.action.id);
    if (lastInfo && settings?.scriptId) {
      const resolvedId = this.resolveScriptId(lastInfo);
      const isActive = resolvedId === settings.scriptId;
      this.isActiveScript.set(ev.action.id, isActive);
      if (ev.action.isKey()) {
        this.renderKey(ev, settings.scriptLabel || settings.scriptId || "No Script", isActive, false);
      }
    }
  }

  override async onKeyDown(
    ev: KeyDownEvent
  ): Promise<void> {
    const globalSettings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    if (!globalSettings.serverUrl || !globalSettings.apiKey) {
      await ev.action.showAlert();
      return;
    }

    const conn = connectionManager.getConnection(globalSettings.serverUrl, globalSettings.apiKey);
    if (conn.connectionState !== "active") {
      await ev.action.showAlert();
      return;
    }

    const actionSettings = this.actionSettings.get(ev.action.id);
    const scriptId = actionSettings?.scriptId?.trim();
    if (!scriptId) {
      await ev.action.showAlert();
      return;
    }

    // Already loaded — just ensure the active render is showing, skip the command
    const lastInfo = conn.lastScriptInfo;
    const currentResolvedId = lastInfo ? this.resolveScriptId(lastInfo) : undefined;
    if (currentResolvedId === scriptId) {
      this.isActiveScript.set(ev.action.id, true);
      const entry = this.actionConnections.get(ev.action.id);
      if (entry?.ev.action.isKey()) {
        this.renderKey(entry.ev, actionSettings?.scriptLabel || scriptId, true, false);
      }
      return;
    }

    conn.sendRemoteControl({ type: "switch_script", scriptId });

    // Enter loading state
    this.isLoading.set(ev.action.id, true);
    const entry = this.actionConnections.get(ev.action.id);
    if (entry?.ev.action.isKey()) {
      this.renderKey(entry.ev, actionSettings?.scriptLabel || scriptId, false, true);
    }

    // Timeout: show warning after 8s if no confirmation
    this.clearLoadingTimeout(ev.action.id);
    this.loadingTimeouts.set(ev.action.id, setTimeout(() => {
      if (this.isLoading.get(ev.action.id)) {
        this.isLoading.set(ev.action.id, false);
        this.showWarning(ev.action.id);
      }
    }, 8000));
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
    this.actionSettings.delete(ev.action.id);
    this.isActiveScript.delete(ev.action.id);
    this.clearLoading(ev.action.id);
    this.isWarning.delete(ev.action.id);
    this.clearWarningTimeout(ev.action.id);
  }

  private clearLoading(actionId: string): void {
    this.isLoading.set(actionId, false);
    this.clearLoadingTimeout(actionId);
  }

  private clearLoadingTimeout(actionId: string): void {
    const existing = this.loadingTimeouts.get(actionId);
    if (existing) {
      clearTimeout(existing);
      this.loadingTimeouts.delete(actionId);
    }
  }

  private showWarning(actionId: string): void {
    this.isWarning.set(actionId, true);
    const entry = this.actionConnections.get(actionId);
    const settings = this.actionSettings.get(actionId);
    const active = this.isActiveScript.get(actionId) ?? false;
    if (entry?.ev.action.isKey()) {
      this.renderKey(entry.ev, settings?.scriptLabel || settings?.scriptId || "No Script", active, false, true);
    }
    // Auto-clear warning after 5s
    this.clearWarningTimeout(actionId);
    this.warningTimeouts.set(actionId, setTimeout(() => {
      this.isWarning.set(actionId, false);
      if (entry?.ev.action.isKey()) {
        this.renderKey(entry.ev, settings?.scriptLabel || settings?.scriptId || "No Script", active, false, false);
      }
    }, 5000));
  }

  private clearWarningTimeout(actionId: string): void {
    const existing = this.warningTimeouts.get(actionId);
    if (existing) {
      clearTimeout(existing);
      this.warningTimeouts.delete(actionId);
    }
  }

  /**
   * Word-wrap text into lines of approximately maxCharsPerLine characters.
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

    if (currentLine.length > 0 && lines.length < maxLines) {
      lines.push(currentLine);
    }

    return lines;
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

  /**
   * Render the full key face as SVG with "LOAD" header bar + word-wrapped script name.
   * Green background when this is the active script.
   */
  private async renderKey(
    ev: WillAppearEvent,
    label: string,
    isActive: boolean,
    isLoading: boolean,
    isWarning: boolean = false
  ): Promise<void> {
    const bgColor = "#1a1a2e";
    const headerBg = isWarning ? "#cc2222" : isLoading ? "#cc8800" : isActive ? "#1b8a2a" : "#00e5ff";
    const headerText = isWarning || isLoading || isActive ? "#ffffff" : "#000000";
    const headerLabel = isWarning ? "FAILED" : isLoading ? "LOADING…" : "LOAD SCRIPT";

    const settings = this.actionSettings.get(ev.action.id);
    const fontSize = settings?.titleFontSize || 20;
    const lineSpacing = Math.round(fontSize * 1.3);
    const lines = this.wrapText(label, Math.max(6, Math.round(120 / (fontSize * 0.6))));
    const totalHeight = lines.length * lineSpacing;
    const startY = 32 + Math.round((112 - totalHeight) / 2) + fontSize;

    const titleTspans = lines
      .map((line, i) => {
        const y = startY + i * lineSpacing;
        return `<text x="72" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" fill="#ffffff">${this.escapeXml(line)}</text>`;
      })
      .join("\n  ");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  <rect width="144" height="144" rx="16" fill="${bgColor}"/>
  <rect y="0" width="144" height="32" rx="8" fill="${headerBg}"/>
  <rect y="16" width="144" height="16" fill="${headerBg}"/>
  <text x="72" y="23" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" letter-spacing="1.5" fill="${headerText}">${headerLabel}</text>
  ${titleTspans}
</svg>`;

    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    if (ev.action.isKey()) {
      ev.action.setTitle("");
      ev.action.setImage(dataUri);
    }
  }

  /**
   * Re-render from settings change (no WillAppearEvent available).
   */
  private async renderKeyFromSettings(
    actionId: string,
    settings: LoadScriptSettings,
    isActive: boolean
  ): Promise<void> {
    const entry = this.actionConnections.get(actionId);
    if (entry?.ev.action.isKey()) {
      await this.renderKey(entry.ev, settings.scriptLabel || settings.scriptId || "No Script", isActive, false);
    }
  }
}
