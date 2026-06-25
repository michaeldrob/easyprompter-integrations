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

// When global settings change (user enters URL + API key), establish connection
streamDeck.settings.onDidReceiveGlobalSettings<EasyPrompterSettings>((ev) => {
  const s = ev.settings;
  if (!s.serverUrl || !s.apiKey) return;
  // Disconnect stale connections before creating/reusing the new one
  connectionManager.disconnectAllExcept(s.serverUrl, s.apiKey);
  const conn = connectionManager.getConnection(s.serverUrl, s.apiKey);
  conn.connect();
});

// Connect to Stream Deck
streamDeck.connect();
