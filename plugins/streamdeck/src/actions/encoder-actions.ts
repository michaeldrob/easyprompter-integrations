import streamDeck from "@elgato/streamdeck";
import { connectionManager } from "../connection-manager";
import { queueSpeedChange } from "../speed-debounce";
import type { EasyPrompterSettings } from "../types";

/**
 * Actions that can be assigned to encoder press or touch.
 * Must match the <option> values in encoder-settings.html.
 */
export type EncoderAction =
  | "none"
  | "play_pause"
  | "reset"
  | "next_marker"
  | "prev_marker"
  | "speed_up"
  | "speed_down";

export interface EncoderActionSettings {
  pressAction?: EncoderAction;
  touchAction?: EncoderAction;
  [key: string]: unknown;
}

const SPEED_STEP = 5;

/**
 * Execute a configured encoder action.
 * Reads global settings to get the connection, then dispatches.
 */
export async function executeEncoderAction(actionType: EncoderAction): Promise<void> {
  if (actionType === "none") return;

  // Speed changes use debounced batching
  if (actionType === "speed_up") {
    queueSpeedChange(SPEED_STEP);
    return;
  }
  if (actionType === "speed_down") {
    queueSpeedChange(-SPEED_STEP);
    return;
  }

  const settings = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
  if (!settings.serverUrl || !settings.apiKey) return;

  const conn = connectionManager.getConnection(settings.serverUrl, settings.apiKey);
  if (conn.connectionState !== "active") return;

  switch (actionType) {
    case "play_pause":
      conn.sendRemoteControl({ type: "play_pause" });
      break;
    case "reset":
      conn.sendRemoteControl({ type: "reset" });
      break;
    case "next_marker":
      conn.sendRemoteControl({ type: "next_marker" });
      break;
    case "prev_marker":
      conn.sendRemoteControl({ type: "prev_marker" });
      break;
  }
}
