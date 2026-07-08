// Re-export shared types from the remote-client package
export type {
  ConnectionState,
  RemoteControlAction,
  PlaybackState,
  PrompterState,
  TimerData,
  SettingsData,
  ScriptInfo,
} from "@easyprompter/remote-client";

/**
 * Global settings shared across all EasyPrompter actions.
 * Stored once at the plugin level via Stream Deck global settings.
 */
export type EasyPrompterSettings = {
  /** The base URL of the EasyPrompter instance (e.g. https://easyprompter.com) */
  serverUrl: string;
  /** Integration key for persistent authentication (e.g. ep_rk_...) */
  apiKey: string;
  /** Live connection state — written by the plugin, read by Property Inspectors */
  connectionStatus?: "disconnected" | "waiting" | "active" | "error";
  /** If the connection failed, this contains the error code (e.g., CONNECTION_LIMIT_REACHED) */
  connectionError?: string | null;
};

/**
 * Per-action settings for shuttle-type actions (Fast Forward, Rewind).
 */
export interface ShuttleActionSettings {
  /** Shuttle displacement 0.0–1.0 (default 1.0 = full speed) */
  shuttleRate?: number;
  [key: string]: unknown;
}
