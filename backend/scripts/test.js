// Resets the disposable test database, seeds it, then runs node:test.
// Uses TEST_DATABASE_URL only; it never touches DATABASE_URL.
import 'dotenv/config';
import { execSync } from 'node:child_process';

const url = process.env.TEST_DATABASE_URL || 'file:./test.db';
if (!/test/i.test(url)) throw new Error('Refusing to run: TEST_DATABASE_URL must contain "test"');
const env = { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url, NODE_ENV: 'test' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });
run('npx prisma migrate reset --force --skip-seed --skip-generate');
run('node prisma/seed.js');
run('node --test --test-concurrency=1 test/');
