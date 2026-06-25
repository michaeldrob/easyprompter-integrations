#!/usr/bin/env node
/**
 * CLI tool to simulate Stream Deck+ encoder actions against a running
 * EasyPrompter instance. Tests speed-dial and shuttle-dial without hardware.
 *
 * Usage:
 *   node test-dials.mjs <serverUrl> <apiKey> [mode]
 *
 * Modes:
 *   speed    - Simulate speed dial (rotate to adjust WPM)
 *   shuttle  - Simulate shuttle dial (rotate to shuttle fwd/rev)
 *   both     - Run both in sequence (default)
 *
 * Examples:
 *   node test-dials.mjs https://beta.easyprompter.com ep_rk_abc123 speed
 *   node test-dials.mjs https://beta.easyprompter.com ep_rk_abc123 shuttle
 */

import { io } from "socket.io-client";
import { createInterface } from "readline";

const [serverUrl, apiKey, mode = "both"] = process.argv.slice(2);

if (!serverUrl || !apiKey) {
  console.error("Usage: node test-dials.mjs <serverUrl> <apiKey> [speed|shuttle|both]");
  process.exit(1);
}

// ── Connect ──────────────────────────────────────────────────────────────────

console.log(`\n🔌 Connecting to ${serverUrl}...`);

// Allow self-signed certs (dev/home servers)
// TLS validation disabled via rejectUnauthorized in socket options below

const socket = io(serverUrl, {
  path: "/api/socket/io",
  auth: { apiKey },
  query: { clientId: "d1a17e57-0000-4000-8000-000000000001", clientType: "remote" },
  transports: ["websocket"],
  reconnection: false,
  rejectUnauthorized: false,
});

let currentSpeed = 150;
let connected = false;
let started = false;

socket.on("connect", () => console.log("✅ Socket connected"));
socket.on("waiting_for_session", () => console.log("⏳ Waiting for teleprompter session..."));
socket.on("session_joined", () => {
  console.log("🎯 Joined session!\n");
  connected = true;
  if (!started) { started = true; startInteractive(); }
});
socket.on("session_state", (data) => {
  currentSpeed = data.playbackSpeed ?? currentSpeed;
  console.log(`   📊 State: ${data.paused ? "paused" : "playing"} @ ${currentSpeed} WPM`);
  if (!started) { started = true; connected = true; console.log("🎯 Session active!\n"); startInteractive(); }
});
socket.on("playback_state", (data) => {
  if (data.playbackSpeed != null) currentSpeed = data.playbackSpeed;
  const playing = data.paused === 0 ? "▶ playing" : "⏸ paused";
  console.log(`   📊 ${playing} @ ${currentSpeed} WPM`);
});
socket.on("error", (data) => console.error("❌ Server error:", data));
socket.on("disconnect", (reason) => {
  console.log(`\n🔌 Disconnected: ${reason}`);
  process.exit(0);
});
socket.on("connect_error", (err) => {
  console.error(`❌ Connection failed: ${err.message}`);
  process.exit(1);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

let tsCounter = Date.now();

function send(action) {
  tsCounter++;
  socket.emit("remote_control", { ...action, ts: tsCounter });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Speed Dial Simulation ────────────────────────────────────────────────────

async function simulateSpeedDial() {
  console.log("🎛️  === SPEED DIAL TEST ===");
  console.log("   Rotate right: speed up (+5 WPM per tick)");

  for (let i = 0; i < 6; i++) {
    currentSpeed = Math.min(500, currentSpeed + 5);
    send({ type: "set_speed", speedWpm: currentSpeed });
    console.log(`   ↻ tick +1 → ${currentSpeed} WPM`);
    await sleep(200);
  }

  console.log("\n   Rotate left: speed down (-5 WPM per tick)");
  for (let i = 0; i < 3; i++) {
    currentSpeed = Math.max(10, currentSpeed - 5);
    send({ type: "set_speed", speedWpm: currentSpeed });
    console.log(`   ↺ tick -1 → ${currentSpeed} WPM`);
    await sleep(200);
  }

  console.log("   ✅ Speed dial test complete\n");
}

// ── Shuttle Dial Simulation ──────────────────────────────────────────────────

async function simulateShuttleDial() {
  console.log("🎛️  === SHUTTLE DIAL TEST ===");

  console.log("   Shuttle forward (gentle)...");
  send({ type: "shuttle_set", displacement: 0.3 });
  await sleep(1000);

  console.log("   Shuttle forward (medium)...");
  send({ type: "shuttle_set", displacement: 0.6 });
  await sleep(1000);

  console.log("   Shuttle forward (full speed)...");
  send({ type: "shuttle_set", displacement: 1.0 });
  await sleep(1500);

  console.log("   Release shuttle...");
  send({ type: "shuttle_release" });
  await sleep(500);

  console.log("   Shuttle backward (medium)...");
  send({ type: "shuttle_set", displacement: -0.5 });
  await sleep(1500);

  console.log("   Release shuttle...");
  send({ type: "shuttle_release" });
  await sleep(500);

  console.log("   ✅ Shuttle dial test complete\n");
}

// ── Interactive Mode ─────────────────────────────────────────────────────────

function startInteractive() {
  if (mode === "speed" || mode === "both") {
    simulateSpeedDial().then(() => {
      if (mode === "both") return simulateShuttleDial();
    }).then(() => {
      enterManualMode();
    });
  } else if (mode === "shuttle") {
    simulateShuttleDial().then(() => enterManualMode());
  } else {
    enterManualMode();
  }
}

function enterManualMode() {
  console.log("🎮 Manual mode — type commands:");
  console.log("   s+N    Speed up by N WPM (e.g. s+10)");
  console.log("   s-N    Speed down by N WPM");
  console.log("   f0.5   Shuttle forward at 0.5 displacement");
  console.log("   r0.5   Shuttle reverse at 0.5 displacement");
  console.log("   x      Release shuttle");
  console.log("   p      Play/pause toggle");
  console.log("   q      Quit\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("dial> ");
  rl.prompt();

  rl.on("line", (line) => {
    const cmd = line.trim();
    if (!cmd) { rl.prompt(); return; }

    if (cmd === "q") {
      socket.disconnect();
      rl.close();
      return;
    }
    if (cmd === "p") {
      send({ type: "play_pause" });
      console.log("   ⏯ play/pause toggled");
    } else if (cmd === "x") {
      send({ type: "shuttle_release" });
      console.log("   ⏹ shuttle released");
    } else if (cmd.startsWith("s+") || cmd.startsWith("s-")) {
      const delta = parseInt(cmd.slice(1), 10);
      currentSpeed = Math.max(10, Math.min(500, currentSpeed + delta));
      send({ type: "set_speed", speedWpm: currentSpeed });
      console.log(`   🎛️ speed → ${currentSpeed} WPM`);
    } else if (cmd.startsWith("f")) {
      const d = parseFloat(cmd.slice(1));
      send({ type: "shuttle_set", displacement: Math.min(1, Math.abs(d)) });
      console.log(`   ▶ shuttle forward @ ${d}`);
    } else if (cmd.startsWith("r")) {
      const d = parseFloat(cmd.slice(1));
      send({ type: "shuttle_set", displacement: -Math.min(1, Math.abs(d)) });
      console.log(`   ◀ shuttle reverse @ ${d}`);
    } else {
      console.log("   ❓ Unknown command. Try: s+10, s-5, f0.5, r0.3, x, p, q");
    }
    rl.prompt();
  });
}
