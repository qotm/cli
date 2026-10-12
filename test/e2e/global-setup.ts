import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { QUOTES, tempDir, writeDataset } from '../datasets.js';
import { API, API_PORT, BACKEND_API, CURRENT, RELEASES, RELEASES_PORT, WEB } from './stack.js';

/**
 * The CLI's e2e suite runs the built `qotm` against the backend's real API,
 * started from its compiled build with .env.test (the test database, password
 * sign-in on), on a port of its own. The test database is reseeded and the
 * test Redis flushed first. Never run it alongside the backend's or web's e2e
 * suites: they share the test database.
 */
let api: ChildProcess | undefined;
let releases: Server | undefined;

/** The releases host: files under a temp folder, by path; tests replace them (inject('releases')). */
function startReleases(root: string) {
	releases = createServer((req, res) => {
		const file = join(root, decodeURIComponent((req.url ?? '/').split('?')[0]!));
		if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
			res.writeHead(404).end();
			return;
		}
		res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(statSync(file).size) });
		createReadStream(file).pipe(res);
	});
	return new Promise<void>((r) => releases!.listen(RELEASES_PORT, r));
}

export async function setup({ provide }: TestProject) {
	execSync('yarn build', { stdio: 'ignore' });
	const cwd = fileURLToPath(BACKEND_API);
	execSync('yarn test:db:seed:e2e', { cwd, stdio: 'ignore' });
	execSync('docker exec qotm-test-redis redis-cli FLUSHALL', { stdio: 'ignore' });

	// The current release, as a real file the manifest describes.
	const root = tempDir('qotm-releases-');
	mkdirSync(join(root, CURRENT));
	const file = writeDataset(join(root, CURRENT, 'qotm.sqlite'), QUOTES, { version: CURRENT });
	const bytes = readFileSync(file);
	const sha = createHash('sha256').update(bytes).digest('hex');
	execSync(
		`docker exec qotm-test-database psql -U root -d main -c "UPDATE releases SET sha256 = '${sha}', size_bytes = ${bytes.length} WHERE version = '${CURRENT}'"`,
		{ stdio: 'ignore' }
	);
	await startReleases(root);
	provide('releases', root);

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
			LOG_LEVEL: 'warn',
			RELEASES_BASE_URL: RELEASES
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
	await new Promise<void>((r) => (releases ? releases.close(() => r()) : r()));
}

declare module 'vitest' {
	export interface ProvidedContext {
		/** The releases host's folder: <version>/qotm.sqlite. */
		releases: string;
	}
}
