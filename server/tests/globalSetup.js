import { execSync } from 'node:child_process';
import { env } from '../config/env.js';

// NODE_ENV is test here, so config/env.js has already read .env.test.
export default function setup() {
  const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);

  // The suite truncates every table between tests. Pointing it at the
  // development database by mistake would wipe it, so the name has to say
  // out loud that it is disposable.
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to run against "${databaseName}": the test database name must end with _test. Check server/.env.test.`,
    );
  }

  execSync('npx prisma migrate deploy', {
    env: {
      ...process.env,
      DATABASE_URL: env.DATABASE_URL,
      DIRECT_URL: env.DIRECT_URL ?? env.DATABASE_URL,
    },
    stdio: 'inherit',
  });
}
