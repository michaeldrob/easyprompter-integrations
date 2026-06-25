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
  /** API key for persistent authentication (e.g. ep_rk_...) */
  apiKey: string;
};

/**
 * Per-action settings for shuttle-type actions (Fast Forward, Rewind).
 */
export interface ShuttleActionSettings {
  /** Shuttle displacement 0.0–1.0 (default 1.0 = full speed) */
  shuttleRate?: number;
  [key: string]: unknown;
}
