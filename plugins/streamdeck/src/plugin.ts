import streamDeck from "@elgato/streamdeck";

import { PlayPause } from "./actions/play-pause";
import { SpeedUp } from "./actions/speed-up";
import { SpeedDown } from "./actions/speed-down";
import { FastForward } from "./actions/fast-forward";
import { Rewind } from "./actions/rewind";
import { NextMarker } from "./actions/next-marker";
import { PrevMarker } from "./actions/prev-marker";
import { ResetToStart } from "./actions/reset";
import { SpeedDial } from "./actions/speed-dial";
import { ShuttleDial } from "./actions/shuttle-dial";
import { ScrollWheel } from "./actions/scroll-wheel";
import { Timer } from "./actions/timer";
import { FontSize } from "./actions/font-size";
import { LineHeight } from "./actions/line-height";
import { MarginAction } from "./actions/margin";
import { Blackout } from "./actions/blackout";
import { Progress } from "./actions/progress";
import { ScriptTitle } from "./actions/script-title";
import { LoadScript } from "./actions/load-script";
import { connectionManager } from "./connection-manager";
import type { EasyPrompterSettings } from "./types";

// Log level controlled by manifest Debug setting

// Register all actions
streamDeck.actions.registerAction(new PlayPause());
streamDeck.actions.registerAction(new SpeedUp());
streamDeck.actions.registerAction(new SpeedDown());
streamDeck.actions.registerAction(new FastForward());
streamDeck.actions.registerAction(new Rewind());
streamDeck.actions.registerAction(new NextMarker());
streamDeck.actions.registerAction(new PrevMarker());
streamDeck.actions.registerAction(new ResetToStart());
streamDeck.actions.registerAction(new SpeedDial());
streamDeck.actions.registerAction(new ShuttleDial());
streamDeck.actions.registerAction(new ScrollWheel());
streamDeck.actions.registerAction(new Timer());
streamDeck.actions.registerAction(new FontSize());
streamDeck.actions.registerAction(new LineHeight());
streamDeck.actions.registerAction(new MarginAction());
streamDeck.actions.registerAction(new Blackout());
streamDeck.actions.registerAction(new Progress());
streamDeck.actions.registerAction(new ScriptTitle());
streamDeck.actions.registerAction(new LoadScript());

// Track the current connection config so we can skip no-op handler calls
// caused by our own connectionStatus writes to global settings.
let lastConnectedUrl = "";
let lastConnectedKey = "";
let connectionStateUnsub: (() => void) | null = null;

// When global settings change (user enters URL + API key), establish connection
streamDeck.settings.onDidReceiveGlobalSettings<EasyPrompterSettings>((ev) => {
  const s = ev.settings;
  if (!s.serverUrl || !s.apiKey) return;

  // Skip if URL+key haven't changed — this is just our own connectionStatus write
  if (s.serverUrl === lastConnectedUrl && s.apiKey === lastConnectedKey) return;
  lastConnectedUrl = s.serverUrl;
  lastConnectedKey = s.apiKey;

  // Disconnect stale connections before creating/reusing the new one
  connectionManager.disconnectAllExcept(s.serverUrl, s.apiKey);
  const conn = connectionManager.getConnection(s.serverUrl, s.apiKey);
  conn.connect();

  // Clean up previous listener
  if (connectionStateUnsub) {
    connectionStateUnsub();
    connectionStateUnsub = null;
  }

  // Broadcast connection state changes to global settings so PIs can display it
  connectionStateUnsub = conn.onConnectionStateChange(async (state) => {
    const current = await streamDeck.settings.getGlobalSettings<EasyPrompterSettings>();
    const err = state === "error" ? conn.lastErrorCode : null;
    if (current.connectionStatus !== state || current.connectionError !== err) {
      await streamDeck.settings.setGlobalSettings({ ...current, connectionStatus: state, connectionError: err });
    }
  });
});

// Connect to Stream Deck
streamDeck.connect();
