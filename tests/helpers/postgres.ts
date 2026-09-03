import { createServer, type Socket } from 'node:net';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Disposable loopback PostgreSQL wire bridge for testing the REAL pg driver
// and Prisma adapter. Not a production database, and no secrets are needed.
// PGlite has one backend, so integration cases use sequential transactions.
export async function testPostgres(
  options: { roundTripMs?: number; onRoundTrip?: () => void } = {},
) {
  const database = new PGlite();
  const root = new URL('../../prisma/migrations/', import.meta.url);
  for (const entry of (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name)))
    await database.exec(
      await readFile(new URL(`${entry.name}/migration.sql`, root), 'utf8'),
    );
  const sockets = new Set<Socket>();
  let queue = Promise.resolve();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let pending = Buffer.alloc(0);
    let startup = true;
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= (startup ? 4 : 5)) {
        const size = startup
          ? pending.readInt32BE(0)
          : pending.readInt32BE(1) + 1;
        if (pending.length < size) break;
        const frame = pending.subarray(0, size);
        pending = pending.subarray(size);
        if (startup) {
          if (frame.readInt32BE(4) === 80877103) {
            socket.write('N');
            continue;
          }
          startup = false;
          // AuthenticationOk, followed by ReadyForQuery (idle).
          socket.write(
            Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]),
          );
        } else if (frame[0] === 88) {
          socket.end();
        } else {
          queue = queue
            .then(async () => {
              const result = await database.execProtocolRaw(frame);
              // One delay per query round trip (simple Query or extended Sync),
              // not per protocol frame. Allows testing realistic remote latency.
              if (options.roundTripMs && (frame[0] === 81 || frame[0] === 83))
                await new Promise((resolve) =>
                  setTimeout(resolve, options.roundTripMs),
                );
              if (frame[0] === 81 || frame[0] === 83) options.onRoundTrip?.();
              if (!socket.destroyed) socket.write(result);
            })
            .catch(() => {
              socket.destroy();
            });
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw Error('Test listener failed');
  return {
    database,
    url: `postgres://test:test@127.0.0.1:${address.port}/test?sslmode=disable`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await queue;
      await database.close();
    },
  };
}
