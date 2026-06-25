import streamDeck from "@elgato/streamdeck";
import { ConnectionManager } from "@easyprompter/remote-client";

const sdLogger = streamDeck.logger.createScope("ConnectionManager");

/**
 * Singleton connection manager instance.
 * Injects the Stream Deck logger so connection events appear in the SD debug log.
 */
export const connectionManager = new ConnectionManager({
  info: (msg) => sdLogger.info(msg),
  warn: (msg) => sdLogger.warn(msg),
  error: (msg) => sdLogger.error(msg),
  debug: (msg) => sdLogger.debug(msg),
});

// Re-export the connection class under the old name so action files
// that import SocketIOConnection don't need to change.
export { EasyPrompterConnection as SocketIOConnection } from "@easyprompter/remote-client";
