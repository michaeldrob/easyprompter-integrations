import streamDeck from "@elgato/streamdeck";
import type { PrompterCommand, PrompterState } from "./types";

const logger = streamDeck.logger.createScope("ConnectionManager");

type StateListener = (state: PrompterState) => void;
type ConnectionListener = (connected: boolean) => void;

/**
 * Manages the WebSocket connection to an EasyPrompter instance.
 * Singleton per server URL — multiple actions share the same connection.
 */
class ConnectionManager {
  private connections = new Map<string, WebSocketConnection>();

  /**
   * Get or create a connection for the given server URL.
   */
  getConnection(serverUrl: string): WebSocketConnection {
    const normalized = this.normalizeUrl(serverUrl);

    let conn = this.connections.get(normalized);
    if (!conn) {
      conn = new WebSocketConnection(normalized);
      this.connections.set(normalized, conn);
    }

    return conn;
  }

  /**
   * Disconnect and remove a connection.
   */
  removeConnection(serverUrl: string): void {
    const normalized = this.normalizeUrl(serverUrl);
    const conn = this.connections.get(normalized);
    if (conn) {
      conn.disconnect();
      this.connections.delete(normalized);
    }
  }

  private normalizeUrl(url: string): string {
    // Strip trailing slash and ensure consistent format
    return url.replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * Individual WebSocket connection to an EasyPrompter instance.
 */
class WebSocketConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000; // 1 second
  private readonly maxReconnectDelay = 30000; // 30 seconds

  private stateListeners = new Set<StateListener>();
  private connectionListeners = new Set<ConnectionListener>();

  private _connected = false;
  private _lastState: PrompterState | null = null;

  constructor(private readonly serverUrl: string) {}

  get connected(): boolean {
    return this._connected;
  }

  get lastState(): PrompterState | null {
    return this._lastState;
  }

  /**
   * Subscribe to state updates from the teleprompter.
   */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    // Emit current state immediately if available
    if (this._lastState) {
      listener(this._lastState);
    }
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribe to connection status changes.
   */
  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this._connected);
    return () => this.connectionListeners.delete(listener);
  }

  /**
   * Establish the WebSocket connection.
   */
  connect(): void {
    if (this.ws) {
      return; // Already connected or connecting
    }

    const wsUrl = this.buildWsUrl();
    logger.info(`Connecting to EasyPrompter at ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        logger.info(`Connected to EasyPrompter at ${this.serverUrl}`);
        this.reconnectAttempts = 0;
        this.setConnected(true);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(String(event.data));
          this.handleMessage(message);
        } catch (err) {
          logger.error(`Failed to parse message: ${err}`);
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        logger.warn(
          `Disconnected from EasyPrompter (code: ${event.code}, reason: ${event.reason})`
        );
        this.ws = null;
        this.setConnected(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (_event: Event) => {
        logger.error(`WebSocket error occurred`);
      };
    } catch (err) {
      logger.error(`Failed to create WebSocket: ${err}`);
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  /**
   * Cleanly close the WebSocket connection.
   */
  disconnect(): void {
    this.cancelReconnect();
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on intentional disconnect
      this.ws.close();
      this.ws = null;
    }
    this.setConnected(false);
  }

  /**
   * Send a command to the teleprompter.
   */
  sendCommand(command: PrompterCommand, payload?: Record<string, unknown>): void {
    if (!this.ws || !this._connected) {
      logger.warn(`Cannot send command "${command}" — not connected`);
      return;
    }

    const message = JSON.stringify({
      type: "command",
      command,
      ...payload,
    });

    this.ws.send(message);
    logger.debug(`Sent command: ${command}`);
  }

  // --- Private methods ---

  private buildWsUrl(): string {
    const url = new URL(this.serverUrl);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}/api/streamdeck`;
  }

  private handleMessage(message: Record<string, unknown>): void {
    switch (message.type) {
      case "state":
        this._lastState = message.data as PrompterState;
        this.stateListeners.forEach((listener) => {
          if (this._lastState) {
            listener(this._lastState);
          }
        });
        break;

      case "pong":
        // Heartbeat response — connection is alive
        break;

      default:
        logger.debug(`Unknown message type: ${message.type}`);
    }
  }

  private setConnected(connected: boolean): void {
    if (this._connected === connected) return;
    this._connected = connected;
    this.connectionListeners.forEach((listener) => listener(connected));
  }

  private scheduleReconnect(): void {
    this.cancelReconnect();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn(
        `Max reconnect attempts (${this.maxReconnectAttempts}) reached for ${this.serverUrl}`
      );
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts) +
        Math.random() * 1000,
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
    logger.info(
      `Reconnecting to ${this.serverUrl} in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Singleton connection manager instance */
export const connectionManager = new ConnectionManager();
