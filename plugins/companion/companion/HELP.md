# EasyPrompter — Companion Module

Control your EasyPrompter teleprompter directly from Bitfocus Companion. Includes transport controls, speed/display adjustments, MIDI shuttle/jog support, real-time variables, and ready-made presets.

---

## Setup

1. Add an **EasyPrompter** connection in Companion
2. Enter your **Server URL** (e.g. `https://app.easyprompter.com`)
3. Enter your **API Key** — find it in EasyPrompter → Settings → Remote Control
4. The connection status indicator turns green when connected

---

## Actions (21)

### Transport

| Action | Description |
|--------|-------------|
| Play / Pause | Toggle playback |
| Reset to Start | Reset to beginning |
| Next Marker | Jump to next script marker |
| Previous Marker | Jump to previous marker |
| Fast Forward (Hold) | Hold to fast forward (rate: 0.1–1.0) |
| Fast Forward Release | Release fast forward |
| Rewind (Hold) | Hold to rewind (rate: 0.1–1.0) |
| Rewind Release | Release rewind |
| Blackout Toggle | Toggle blank screen on display |

### Speed

| Action | Description |
|--------|-------------|
| Speed Up | Increase speed (step 1–50, default 5) |
| Speed Down | Decrease speed (step 1–50, default 5) |
| Set Speed | Set exact speed value (10–500, default 150) |

### Display Settings

| Action | Description |
|--------|-------------|
| Font Size Up | Increase font size (step 1–20px, default 2) |
| Font Size Down | Decrease font size |
| Line Height Up | Increase line height (step 1–50%, default 10) |
| Line Height Down | Decrease line height |
| Margin Up | Increase screen margin (step 1–30%, default 5) |
| Margin Down | Decrease screen margin |

### Advanced / MIDI

| Action | Description |
|--------|-------------|
| Shuttle Set | Set shuttle displacement (−1.0 to 1.0) for T-bar/fader control |
| Shuttle Release | Release shuttle (returns to normal playback) |
| Jog Tick | Scroll by one step (direction + magnitude 1–5) |

---

## Variables (11)

Use these on button labels with the `$(easyprompter:…)` syntax.

| Variable | Description | Example |
|----------|-------------|---------|
| `$(easyprompter:speed)` | Current speed | `120` |
| `$(easyprompter:status)` | Connection status | `Connected` / `Waiting` / `Offline` |
| `$(easyprompter:elapsed)` | Elapsed time | `05:23` |
| `$(easyprompter:remaining)` | Remaining time | `12:45` |
| `$(easyprompter:progress)` | Progress (%) | `45` |
| `$(easyprompter:is_playing)` | Playing state | `true` / `false` |
| `$(easyprompter:font_size)` | Font size (px) | `72` |
| `$(easyprompter:line_height)` | Line height (%) | `150` |
| `$(easyprompter:script_title)` | Script title | `My Speech` |
| `$(easyprompter:blackout)` | Blackout state | `On` / `Off` |
| `$(easyprompter:screen_margin)` | Screen margin (%) | `10` |

---

## Feedbacks (4)

| Feedback | When Active | Default Style |
|----------|-------------|---------------|
| Prompter is Playing | Teleprompter is playing | Green background |
| Connected to Server | Connected with active session | Blue background |
| Waiting for Session | Connected but no active session | Yellow background |
| Blackout Active | Display is blacked out | Red background |

---

## Presets (24)

Drag-and-drop presets are organized into four categories:

- **Transport** (7) — Play/Pause, Reset, Next Marker, Previous Marker, Fast Forward, Rewind, Blackout
- **Speed** (3) — Speed Display, Speed Up, Speed Down
- **Info & Timers** (9) — Connection Status, Script Title, Progress, Elapsed Time, Remaining Time, Font Size, Line Height, Margin Display
- **Encoders / Knobs** (5) — Speed Knob, Jog Wheel, Font Size Knob, Line Height Knob, Margin Knob

---

## Troubleshooting

- **Status shows "Connecting"** — Check that the Server URL is correct and reachable
- **Status shows "Waiting"** — Connected but no teleprompter session is active; open a script in EasyPrompter
- **Actions don't work** — Ensure a teleprompter session is active (status must be green/connected)
