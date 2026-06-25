# EasyPrompter Hardware Integration

Control your [EasyPrompter](https://easyprompter.com) teleprompter from hardware controllers — Elgato Stream Deck and Bitfocus Companion.

This monorepo contains two plugins and a shared connection library. Both plugins connect to your EasyPrompter session via WebSocket and provide real-time, two-way control of playback, speed, formatting, and more.

## Features

### Elgato Stream Deck Plugin

18 actions with full support for Stream Deck, Stream Deck+, and Stream Deck Neo.

**Keypad Actions (12)**

| Action | Description |
|---|---|
| Play / Pause | Toggle teleprompter playback. Icon syncs with live state. |
| Speed Up | Increase scroll speed |
| Speed Down | Decrease scroll speed |
| Next Marker | Jump to the next marker in the script |
| Previous Marker | Jump to the previous marker |
| Reset to Start | Reset teleprompter to the beginning |
| Fast Forward | Hold to fast forward |
| Rewind | Hold to rewind |
| Timer | Shows elapsed/remaining time — press to toggle mode |
| Blackout | Toggle blank screen |
| Progress | Shows script progress percentage |
| Script Title | Shows the current script name |

**Encoder / Touch Strip Actions (6)** — *Stream Deck+ and Neo*

| Action | Rotate | Push | Touch |
|---|---|---|---|
| Speed Control | Adjust speed | Reset speed | Play / Pause |
| Font Size | Adjust font size | Configurable | Configurable |
| Line Height | Adjust line height | Configurable | Configurable |
| Margin | Adjust margin | Configurable | Configurable |
| Shuttle Control | Shuttle forward/back (3×–5×) | Configurable | Configurable |
| Scroll Wheel | Jog scroll position | Configurable | Configurable |

### Bitfocus Companion Module

Full-featured module for the [Bitfocus Companion](https://bitfocus.io/companion) automation platform.

- **21 actions** — playback, speed, formatting, markers, timer, blackout, and more
- **11 variables** — live state values for use in button labels and triggers
- **4 feedbacks** — conditional styling based on teleprompter state
- **24 presets** — ready-to-use button configurations

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+
- For Stream Deck: [Elgato Stream Deck](https://www.elgato.com/downloads) software v6.7+ and the [Stream Deck CLI](https://docs.elgato.com/streamdeck/cli/intro)
- For Companion: [Bitfocus Companion](https://bitfocus.io/companion) v3+

### Connecting to EasyPrompter

Both plugins require a **Server URL** and **API Key** to connect:

1. Open EasyPrompter → **Settings** → **Remote Control**
2. Copy the **Server URL** and **API Key**
3. Enter them in the plugin's connection settings

### Installation & Build

```bash
# Install all dependencies
pnpm install

# Build everything
pnpm build

# Build only the Stream Deck plugin
pnpm build:streamdeck

# Build only the Companion module
pnpm build:companion
```

## Project Structure

```
easyprompter-devices/
├── packages/
│   └── remote-client/           # @easyprompter/remote-client
│       └── src/
│           ├── connection.ts    # Socket.IO client, reconnection, state sync
│           ├── manager.ts       # Singleton connection manager
│           └── types.ts         # Shared type definitions
├── plugins/
│   ├── streamdeck/              # Elgato Stream Deck plugin
│   │   ├── src/
│   │   │   ├── actions/         # 18 action implementations
│   │   │   ├── plugin.ts        # Entry point
│   │   │   └── connection-manager.ts
│   │   ├── com.easyprompter.streamdeck.sdPlugin/
│   │   │   ├── manifest.json    # Plugin metadata
│   │   │   ├── imgs/            # Action icons
│   │   │   └── ui/              # Property Inspector (settings UI)
│   │   └── rollup.config.mjs
│   └── companion/               # Bitfocus Companion module
│       └── src/
│           ├── index.ts         # Module entry point
│           ├── actions.ts       # 21 action definitions
│           ├── feedbacks.ts     # 4 feedback definitions
│           ├── variables.ts     # 11 variable definitions
│           ├── presets.ts       # 24 preset configurations
│           └── config.ts        # Connection settings
├── docs/                        # Architecture & design docs
├── package.json                 # Workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json           # Shared TypeScript config
```

## Architecture

```
Hardware Device ←→ Plugin (Node.js) ←→ Socket.IO ←→ EasyPrompter Server
```

The `@easyprompter/remote-client` package provides a shared connection layer used by both plugins:

- **Socket.IO WebSocket** connection to the EasyPrompter web app
- **Automatic reconnection** with exponential backoff
- **Real-time state sync** — teleprompter state is pushed to the hardware on every change
- **Throttled notifications** to avoid flooding the server during rapid adjustments

## Development

### Stream Deck

```bash
# Watch mode — rebuilds and reloads the plugin on changes
cd plugins/streamdeck
pnpm watch
```

The compiled plugin lives in `com.easyprompter.streamdeck.sdPlugin/`. To package for distribution:

```bash
streamdeck pack com.easyprompter.streamdeck.sdPlugin
```

### Companion

```bash
# Watch mode — recompiles on changes
cd plugins/companion
pnpm dev

# Package for distribution
pnpm package
```

### Type Checking

```bash
# Type-check all packages
pnpm typecheck
```

## License

[MIT](LICENSE)
