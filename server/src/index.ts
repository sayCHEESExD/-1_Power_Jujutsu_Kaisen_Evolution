import { Server } from '@colyseus/core';
import { Encoder } from '@colyseus/schema';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@jjk/shared';
import { serverConfig } from './config/serverConfig.js';
import { createHttpServer } from './httpServer.js';
import { flushStorageSync } from './persistence/index.js';
import { profileStore } from './progression/ProfileStore.js';
import { installStatReporter } from './bloxity/statReporter.js';
import { GameRoom } from './rooms/GameRoom.js';
import { logger } from './util/logger.js';

const SCOPE = 'server';

/**
 * Enough room for a full room's first patch: fifteen players, each with
 * their own pool of every stage's fighters. The encoder would grow on its own
 * (logging a warning every time); sized once here, it never has to.
 */
Encoder.BUFFER_SIZE = 128 * 1024;

/** Longest a shutdown waits for queued saves before going anyway. */
const FLUSH_TIMEOUT_MS = 20_000;

const boot = async (): Promise<void> => {
  // Open the store BEFORE listening. This never throws: a database that is
  // down is logged loudly and joins are refused until it is back, while
  // /health keeps answering so the host does not restart-loop the pod.
  await profileStore.open();

  const gameServer = new Server({
    transport: new WebSocketTransport({ server: createHttpServer() }),
    greet: false,
  });

  gameServer.define(ROOM_NAME, GameRoom);

  await gameServer.listen(serverConfig.port, serverConfig.host);
  logger.info(
    SCOPE,
    `listening on ${serverConfig.host}:${serverConfig.port} ` +
      `room="${ROOM_NAME}" health=/health storage=${profileStore.kind} game=${serverConfig.gameSlug}`,
  );

  // Bloxity profile stats: a no-op unless BLOXITY_REPORT_TOKEN / BLOXITY_GAME_ID are set.
  const stats = installStatReporter();

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info(SCOPE, `received ${signal}, shutting down`);
    void (async () => {
      try {
        // `false`: do NOT let Colyseus exit the process - the saves that
        // disconnecting every client queued still have to land first.
        await gameServer.gracefullyShutdown(false);
      } catch (error) {
        logger.error(SCOPE, 'graceful shutdown failed:', error);
      }
      // Every room has departed its players by now: one last report, then stop.
      stats.stop();
      await stats.flush();
      const landed = await profileStore.flush(FLUSH_TIMEOUT_MS);
      if (!landed) logger.error(SCOPE, 'some saves were still outstanding at the flush deadline');
      await profileStore.close().catch((error: unknown) => logger.error(SCOPE, 'store close failed:', error));
      logger.info(SCOPE, 'stopped');
      process.exit(0);
    })();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

// A last resort for any exit path that skipped the handler above. The JSON
// store writes synchronously here; Mongo writes are awaited in `shutdown`.
process.on('exit', () => flushStorageSync());

boot().catch((error: unknown) => {
  logger.error(SCOPE, 'failed to start', error);
  process.exit(1);
});
