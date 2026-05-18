import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { PlayPause } from "./actions/play-pause";
import { SpeedUp } from "./actions/speed-up";
import { SpeedDown } from "./actions/speed-down";
import { NextMarker } from "./actions/next-marker";
import { PrevMarker } from "./actions/prev-marker";
import { ResetToStart } from "./actions/reset";
import { SpeedDial } from "./actions/speed-dial";

// Set the log level for development
streamDeck.logger.setLevel(LogLevel.DEBUG);

// Register all actions
streamDeck.actions.registerAction(new PlayPause());
streamDeck.actions.registerAction(new SpeedUp());
streamDeck.actions.registerAction(new SpeedDown());
streamDeck.actions.registerAction(new NextMarker());
streamDeck.actions.registerAction(new PrevMarker());
streamDeck.actions.registerAction(new ResetToStart());
streamDeck.actions.registerAction(new SpeedDial());

// Connect to Stream Deck
streamDeck.connect();
