import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { API, API_PORT, BACKEND_API, WEB } from './stack.js';

/**
 * The CLI's e2e suite runs the built `qotm` against the backend's real API,
 * started from its compiled build with .env.test (the test database, password
 * sign-in on), on a port of its own. The test database is reseeded and the
 * test Redis flushed first. Never run it alongside the backend's or web's e2e
 * suites: they share the test database.
 */
let api: ChildProcess | undefined;

export async function setup() {
	execSync('yarn build', { stdio: 'ignore' });
	const cwd = fileURLToPath(BACKEND_API);
	execSync('yarn test:db:seed:e2e', { cwd, stdio: 'ignore' });
	execSync('docker exec qotm-test-redis redis-cli FLUSHALL', { stdio: 'ignore' });
	api = spawn('yarn', ['dotenv', '-e', '.env.test', '--', 'node', 'dist/src/main'], {
		cwd,
		stdio: 'ignore',
		env: {
			...process.env,
			PORT: String(API_PORT),
			BETTER_AUTH_URL: API,
			FRONTEND_HOST: WEB,
			RATE_LIMIT_ENABLED: 'false',
			AUTH_PASSWORD_ENABLED: 'true',
			BETTER_AUTH_COOKIE_DOMAIN: '',
			LOG_LEVEL: 'warn'
		}
	});
	const deadline = Date.now() + 90_000;
	for (;;) {
		try {
			if ((await fetch(`${API}/health`)).ok) break;
		} catch {
			/* not up yet */
		}
		if (Date.now() > deadline) throw new Error(`The test API did not start on ${API}`);
		await new Promise((r) => setTimeout(r, 500));
	}
}

export async function teardown() {
	api?.kill();
}
