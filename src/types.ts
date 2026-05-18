/**
 * Shared settings for all EasyPrompter actions.
 * Stored per-action instance in Stream Deck.
 */
export type EasyPrompterSettings = {
  /** The base URL of the EasyPrompter instance (e.g. https://app.easyprompter.com) */
  serverUrl: string;

  /** WebSocket connection status — transient, not persisted */
  connected?: boolean;
};

/**
 * Global plugin settings shared across all actions.
 */
export type GlobalSettings = {
  /** Default server URL used when creating new action instances */
  defaultServerUrl: string;
};

/**
 * Commands sent to EasyPrompter via WebSocket
 */
export type PrompterCommand =
  | "play"
  | "pause"
  | "toggle-playback"
  | "speed-up"
  | "speed-down"
  | "next-marker"
  | "prev-marker"
  | "reset"
  | "set-speed";

/**
 * State received from EasyPrompter via WebSocket
 */
export interface PrompterState {
  /** Whether the teleprompter is currently playing */
  isPlaying: boolean;

  /** Current scroll speed (0-100) */
  speed: number;

  /** Current scroll position as a percentage (0-100) */
  position: number;

  /** Name of the currently loaded script */
  scriptName?: string;

  /** Total number of markers in the script */
  markerCount?: number;

  /** Index of the current/nearest marker */
  currentMarkerIndex?: number;
}
