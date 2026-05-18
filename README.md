# EasyPrompter Stream Deck Plugin

Control your [EasyPrompter](https://easyprompter.com) teleprompter directly from your Elgato Stream Deck.

## Features

| Action | Type | Description |
|--------|------|-------------|
| **Play / Pause** | Keypad | Toggle teleprompter playback. Icon syncs with live state. |
| **Speed Up** | Keypad | Increase scroll speed |
| **Speed Down** | Keypad | Decrease scroll speed |
| **Next Marker** | Keypad | Jump to the next marker in the script |
| **Previous Marker** | Keypad | Jump to the previous marker in the script |
| **Reset to Start** | Keypad | Reset teleprompter to the beginning |
| **Speed Control** | Encoder (SD+) | Rotate to adjust speed, press to reset, touch to play/pause |

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- [Stream Deck](https://www.elgato.com/downloads) v6.7 or higher
- [Stream Deck CLI](https://docs.elgato.com/streamdeck/cli/intro): `npm install -g @elgato/cli`
- An EasyPrompter account with an active teleprompter session

## Development Setup

```bash
# Install dependencies
npm install

# Build and watch for changes (auto-reloads in Stream Deck)
npm run watch

# Production build
npm run build
```

## Configuration

1. Drag any EasyPrompter action onto your Stream Deck
2. In the action settings, enter your EasyPrompter server URL (e.g., `https://app.easyprompter.com`)
3. The plugin will connect via WebSocket and sync with your teleprompter session

## Project Structure

```
├── com.easyprompter.streamdeck.sdPlugin/   # Compiled plugin directory
│   ├── bin/                                 # Built JavaScript output
│   ├── imgs/                                # Action icons and plugin branding
│   ├── ui/                                  # Property Inspector (settings UI)
│   └── manifest.json                        # Plugin metadata and action definitions
├── src/                                     # TypeScript source
│   ├── actions/                             # Individual action implementations
│   │   ├── play-pause.ts
│   │   ├── speed-up.ts
│   │   ├── speed-down.ts
│   │   ├── next-marker.ts
│   │   ├── prev-marker.ts
│   │   ├── reset.ts
│   │   └── speed-dial.ts
│   ├── connection-manager.ts                # WebSocket client for EasyPrompter
│   ├── plugin.ts                            # Entry point
│   └── types.ts                             # Shared type definitions
├── package.json
├── rollup.config.mjs                        # Build configuration
└── tsconfig.json
```

## Architecture

The plugin communicates with EasyPrompter via WebSocket:

```
Stream Deck ←→ Plugin (Node.js) ←→ WebSocket ←→ EasyPrompter Server
```

- **ConnectionManager** maintains a single WebSocket connection per server URL, shared across all actions
- Actions subscribe to state updates and send commands through the connection manager
- Automatic reconnection with exponential backoff handles network interruptions

## Building for Distribution

```bash
npm run build
```

The compiled plugin is in `com.easyprompter.streamdeck.sdPlugin/`. To package for Marketplace distribution, see the [Elgato distribution guide](https://docs.elgato.com/streamdeck/sdk/introduction/distribution).

## License

MIT
