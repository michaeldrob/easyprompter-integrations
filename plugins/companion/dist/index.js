import { InstanceBase, InstanceStatus } from "@companion-module/base";
import { EasyPrompterConnection, } from "@easyprompter/remote-client";
import { getConfigFields } from "./config.js";
import { getActionDefinitions } from "./actions.js";
import { getFeedbackDefinitions } from "./feedbacks.js";
import { getVariableDefinitions } from "./variables.js";
import { getPresetDefinitions, getPresetSections } from "./presets.js";
/**
 * EasyPrompter Companion module.
 * Connects to an EasyPrompter instance via the shared remote-client library
 * and exposes transport controls, speed adjustment, markers, and timer display.
 */
export class EasyPrompterModule extends InstanceBase {
    connection = null;
    config = { serverUrl: "", apiKey: "" };
    unsubscribers = [];
    // --- Public state for actions/feedbacks to read ---
    /** Current connection state */
    connectionState = "disconnected";
    /** Whether the prompter is currently playing */
    isPlaying = false;
    /** Current scroll speed */
    currentSpeed = 150;
    /** Whether display is blacked out */
    isBlackout = false;
    // --- Speed debounce state ---
    _speedDelta = 0;
    _speedDebounceTimer = null;
    static SPEED_DEBOUNCE_MS = 80;
    static MIN_SPEED = 10;
    static MAX_SPEED = 500;
    // --- Timer sync state ---
    _displayedElapsed = "00:00";
    _displayedRemaining = "00:00";
    _pendingElapsed = "00:00";
    _pendingRemaining = "00:00";
    _pendingProgress = "0";
    _timerSyncTimer = null;
    // --- Lifecycle ---
    async init(config, _isFirstInit) {
        this.config = config;
        // Set up definitions
        this.setActionDefinitions(getActionDefinitions(this));
        this.setFeedbackDefinitions(getFeedbackDefinitions(this));
        this.setVariableDefinitions(getVariableDefinitions());
        this.setPresetDefinitions(getPresetSections(), getPresetDefinitions());
        // Set initial variable values
        this.setVariableValues({
            speed: "—",
            status: "Offline",
            elapsed: "00:00",
            remaining: "00:00",
            progress: "0",
            is_playing: "Paused",
            font_size: "—",
            line_height: "—",
            script_title: "Script Title",
            blackout: "OFF",
            screen_margin: "—",
        });
        // Connect if configured
        if (this.config.serverUrl && this.config.apiKey) {
            this.connect();
        }
        else {
            this.updateStatus(InstanceStatus.Disconnected, "Missing configuration");
        }
    }
    async configUpdated(config) {
        this.config = config;
        this.disconnect();
        if (this.config.serverUrl && this.config.apiKey) {
            this.connect();
        }
        else {
            this.updateStatus(InstanceStatus.Disconnected, "Missing configuration");
        }
    }
    async destroy() {
        this.disconnect();
    }
    getConfigFields() {
        return getConfigFields();
    }
    // --- Public methods for actions ---
    /**
     * Send a remote control action to the connected EasyPrompter instance.
     * Called by action callbacks.
     */
    sendAction(action) {
        if (!this.connection || this.connectionState !== "active") {
            this.log("warn", `Cannot send "${action.type}" — not connected`);
            return;
        }
        this.connection.sendRemoteControl(action);
    }
    /**
     * Queue a speed change delta. Rapid calls are batched into a single
     * `set_speed` after a short debounce window.
     */
    queueSpeedChange(delta) {
        this._speedDelta += delta;
        if (this._speedDebounceTimer) {
            clearTimeout(this._speedDebounceTimer);
        }
        this._speedDebounceTimer = setTimeout(() => {
            this._speedDebounceTimer = null;
            const d = this._speedDelta;
            this._speedDelta = 0;
            if (d === 0)
                return;
            const newSpeed = Math.max(EasyPrompterModule.MIN_SPEED, Math.min(EasyPrompterModule.MAX_SPEED, this.currentSpeed + d));
            this.sendAction({ type: "set_speed", speedWpm: newSpeed });
        }, EasyPrompterModule.SPEED_DEBOUNCE_MS);
    }
    // --- Private connection management ---
    connect() {
        // Create the connection manager with Companion's logger
        const logger = {
            info: (msg) => this.log("info", msg),
            warn: (msg) => this.log("warn", msg),
            error: (msg) => this.log("error", msg),
            debug: (msg) => this.log("debug", msg),
        };
        this.log("info", `Connecting with URL="${this.config.serverUrl}" apiKey="${this.config.apiKey ? `${this.config.apiKey.slice(0, 4)}...(len=${this.config.apiKey.length})` : "(empty)"}" `);
        this.connection = new EasyPrompterConnection(this.config.serverUrl, this.config.apiKey, logger);
        this.updateStatus(InstanceStatus.Connecting);
        // Subscribe to connection state changes
        this.unsubscribers.push(this.connection.onConnectionStateChange((state) => {
            this.connectionState = state;
            this.updateCompanionStatus(state);
            this.updateStatusVariable(state);
            this.checkFeedbacks("is_connected", "is_waiting");
        }));
        // Subscribe to prompter state changes
        this.unsubscribers.push(this.connection.onStateChange((state) => {
            this.isPlaying = state.isPlaying;
            this.currentSpeed = state.speed;
            this.setVariableValues({
                speed: String(Math.round(state.speed)),
                is_playing: state.isPlaying ? "Playing" : "Paused",
            });
            this.checkFeedbacks("is_playing");
        }));
        // Subscribe to timer updates.
        // Timer strings update at 4Hz from the operator's position pings.
        // Elapsed and remaining cross second boundaries on different pings,
        // causing visual desync (one updates 250ms before the other).
        // Fix: buffer the latest values and only push to Companion variables
        // when BOTH have changed since the last displayed pair.
        this.unsubscribers.push(this.connection.onTimerChange((data) => {
            const [elapsed, remaining] = EasyPrompterModule.compactTimerPair(data.elapsed ?? "00:00", data.remaining ?? "00:00");
            // Always update progress immediately (it changes smoothly)
            const progress = data.progress != null ? String(Math.round(data.progress)) : "0";
            const elapsedChanged = elapsed !== this._displayedElapsed;
            const remainingChanged = remaining !== this._displayedRemaining;
            if (elapsedChanged && remainingChanged) {
                // Both changed — cancel any pending sync timer and push immediately
                if (this._timerSyncTimer) {
                    clearTimeout(this._timerSyncTimer);
                    this._timerSyncTimer = null;
                }
                this._displayedElapsed = elapsed;
                this._displayedRemaining = remaining;
                this.setVariableValues({ elapsed, remaining, progress });
            }
            else if (elapsedChanged || remainingChanged) {
                // Only one changed — buffer latest values and wait up to 600ms
                // for the other to catch up on the next ping.
                // elapsed uses floor (ticks at .000) and remaining uses round
                // (ticks at .500), so they're always ~500ms apart.
                this._pendingElapsed = elapsed;
                this._pendingRemaining = remaining;
                this._pendingProgress = progress;
                if (!this._timerSyncTimer) {
                    this._timerSyncTimer = setTimeout(() => {
                        this._timerSyncTimer = null;
                        this._displayedElapsed = this._pendingElapsed;
                        this._displayedRemaining = this._pendingRemaining;
                        this.setVariableValues({
                            elapsed: this._pendingElapsed,
                            remaining: this._pendingRemaining,
                            progress: this._pendingProgress,
                        });
                    }, 600);
                }
            }
            else {
                // Neither changed — just update progress
                this.setVariableValues({ progress });
            }
        }));
        // Subscribe to display settings changes (font size, line height, blackout)
        this.unsubscribers.push(this.connection.onSettingsChange((data) => {
            const vars = {};
            if (data.fontSize !== undefined)
                vars.font_size = String(Math.round(data.fontSize));
            if (data.lineHeight !== undefined)
                vars.line_height = String(Math.round(data.lineHeight));
            if (data.screenMargin !== undefined)
                vars.screen_margin = String(Math.round(data.screenMargin));
            if (data.blackout !== undefined) {
                this.isBlackout = data.blackout;
                vars.blackout = data.blackout ? "ON" : "OFF";
                this.checkFeedbacks("is_blackout");
            }
            if (Object.keys(vars).length > 0) {
                this.setVariableValues(vars);
            }
        }));
        // Subscribe to script info changes
        this.unsubscribers.push(this.connection.onScriptInfoChange((data) => {
            this.log("debug", `Script info received: ${JSON.stringify(data)}`);
            if (data.scriptTitle !== undefined) {
                this.setVariableValues({ script_title: data.scriptTitle || "Script Title" });
            }
        }));
        // Start the connection
        this.connection.connect();
    }
    disconnect() {
        // Unsubscribe all listeners
        for (const unsub of this.unsubscribers) {
            unsub();
        }
        this.unsubscribers = [];
        // Disconnect and clean up
        if (this.connection) {
            this.connection.disconnect();
            this.connection = null;
        }
        // Reset state
        this.connectionState = "disconnected";
        this.isPlaying = false;
        this.isBlackout = false;
        this.currentSpeed = 150;
        // Clear timer sync
        if (this._timerSyncTimer) {
            clearTimeout(this._timerSyncTimer);
            this._timerSyncTimer = null;
        }
        // Clear speed debounce
        if (this._speedDebounceTimer) {
            clearTimeout(this._speedDebounceTimer);
            this._speedDebounceTimer = null;
        }
        // Only reset connection-dependent values; keep last-known progress,
        // timer, script title, and display settings so they persist across
        // reconnects rather than flashing to zero.
        this.setVariableValues({
            speed: "—",
            status: "Offline",
            is_playing: "Paused",
            blackout: "OFF",
        });
    }
    /**
     * Map remote-client ConnectionState to Companion InstanceStatus.
     */
    updateCompanionStatus(state) {
        switch (state) {
            case "active":
                this.updateStatus(InstanceStatus.Ok);
                break;
            case "waiting":
                this.updateStatus(InstanceStatus.Ok, "Waiting for teleprompter session");
                break;
            case "disconnected":
                this.updateStatus(InstanceStatus.Disconnected);
                break;
            case "error":
                this.updateStatus(InstanceStatus.ConnectionFailure);
                break;
        }
    }
    /**
     * Update the status variable based on connection state.
     */
    updateStatusVariable(state) {
        const labels = {
            active: "Connected",
            waiting: "Waiting",
            disconnected: "Offline",
            error: "Error",
        };
        this.setVariableValues({ status: labels[state] });
    }
    /**
     * Strip leading "00:" hours from an HH:MM:SS pair when the script is
     * under 1 hour, so the text fits on small Companion button displays.
     * If either value has non-zero hours, both keep the full HH:MM:SS format
     * for visual consistency.
     */
    static compactTimerPair(a, b) {
        const strip = (s) => {
            const parts = s.split(":");
            // Only strip if exactly 3 segments and hours segment is "00"
            if (parts.length === 3 && parts[0] === "00")
                return parts.slice(1).join(":");
            return s;
        };
        const hasHours = (s) => {
            const parts = s.split(":");
            return parts.length === 3 && parts[0] !== "00";
        };
        // If either value has non-zero hours, keep both in HH:MM:SS
        if (hasHours(a) || hasHours(b))
            return [a, b];
        return [strip(a), strip(b)];
    }
}
export const UpgradeScripts = [];
export default EasyPrompterModule;
//# sourceMappingURL=index.js.map