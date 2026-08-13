/**
 * scripts/dev-mongo.ts
 *
 * Boots an in-memory MongoDB instance for local manual testing (curl, etc.)
 * so contributors don't need mongod/Docker installed. Prints the connection
 * string and stays alive until killed.
 *
 * Usage:
 *   npx tsx scripts/dev-mongo.ts
 *   # then, in another shell:
 *   MONGODB_URI=<printed URI> npx tsx watch src/server.ts
 */

import { MongoMemoryServer } from 'mongodb-memory-server';

async function main(): Promise<void> {
  const mongod = await MongoMemoryServer.create({
    instance: { dbName: 'leadflow_dev' },
  });
  const uri = mongod.getUri();

  console.log(`MONGODB_URI=${uri}`);
  console.log('In-memory MongoDB running. Press Ctrl+C to stop.');

  const shutdown = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
