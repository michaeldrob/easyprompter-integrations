import { combineRgb, type CompanionFeedbackDefinitions } from "@companion-module/base";
import type { EasyPrompterModule } from "./index.js";

export function getFeedbackDefinitions(
  instance: EasyPrompterModule
): CompanionFeedbackDefinitions {
  return {
    is_playing: {
      type: "boolean",
      name: "Prompter is Playing",
      description: "Changes button style when the teleprompter is playing",
      defaultStyle: {
        bgcolor: combineRgb(0, 204, 0),
        color: combineRgb(0, 0, 0),
      },
      options: [],
      callback: () => {
        return instance.isPlaying;
      },
    },

    is_connected: {
      type: "boolean",
      name: "Connected to Server",
      description: "Changes button style when connected and session is active",
      defaultStyle: {
        bgcolor: combineRgb(0, 100, 200),
        color: combineRgb(255, 255, 255),
      },
      options: [],
      callback: () => {
        return instance.connectionState === "active";
      },
    },

    is_waiting: {
      type: "boolean",
      name: "Waiting for Session",
      description:
        "Changes button style when connected but no session is active",
      defaultStyle: {
        bgcolor: combineRgb(200, 200, 0),
        color: combineRgb(0, 0, 0),
      },
      options: [],
      callback: () => {
        return instance.connectionState === "waiting";
      },
    },

    is_blackout: {
      type: "boolean",
      name: "Blackout Active",
      description: "Changes button style when the display is blacked out",
      defaultStyle: {
        bgcolor: combineRgb(204, 0, 0),
        color: combineRgb(255, 255, 255),
      },
      options: [],
      callback: () => {
        return instance.isBlackout;
      },
    },
  };
}
