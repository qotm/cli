import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { tempDir } from '../datasets.js';
import { API, WEB } from './stack.js';

export const CLI = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));

/** The seeded e2e accounts (backend seeders/e2e.ts). */
export const MEMBER = { email: 'test.user@example.com', password: 'secret', handle: 'test_user' };

export const env = (home: string) => ({ ...process.env, QOTM_HOME: home, QOTM_API_URL: API, NO_COLOR: '1' });

/** Runs the built qotm to completion. */
export function qotm(home: string, ...args: string[]) {
	try {
		return {
			code: 0,
			out: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: env(home), stdio: 'pipe' })
		};
	} catch (err) {
		const e = err as { status: number; stdout: string; stderr: string };
		return { code: e.status, out: e.stdout + e.stderr };
	}
}

/**
 * `qotm login --no-browser` in the background: resolves the printed user
 * code, then (via done) the exit code and everything printed.
 */
export function startLogin(home: string, ...args: string[]) {
	const child = spawn(process.execPath, [CLI, 'login', '--no-browser', ...args], { env: env(home) });
	let out = '';
	const code = new Promise<string>((resolve, reject) => {
		const onData = (b: Buffer) => {
			out += b.toString();
			const m = /\b(QTM-[A-Z0-9]{4})\b/.exec(out);
			if (m) resolve(m[1]!);
		};
		child.stdout.on('data', onData);
		child.stderr.on('data', onData);
		child.on('exit', () => reject(new Error(`qotm login exited before printing a code:\n${out}`)));
	});
	const done = new Promise<{ code: number; out: string }>((resolve) =>
		child.on('exit', (c) => resolve({ code: c ?? 1, out }))
	);
	return { code, done };
}

/** A member's browser session on the test API (password sign-in, test only). */
export async function signIn(who = MEMBER): Promise<string> {
	const res = await fetch(`${API}/auth/sign-in/email`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: WEB },
		body: JSON.stringify({ email: who.email, password: who.password })
	});
	expect(res.ok, await res.clone().text()).toBe(true);
	return res.headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');
}

/** What the web's /device page does: claim the code, then approve or deny it. */
export async function decide(cookie: string, userCode: string, decision: 'approve' | 'deny') {
	await fetch(`${API}/auth/device?user_code=${encodeURIComponent(userCode)}`, { headers: { cookie, origin: WEB } });
	const res = await fetch(`${API}/auth/device/${decision}`, {
		method: 'POST',
		headers: { cookie, origin: WEB, 'content-type': 'application/json' },
		body: JSON.stringify({ userCode })
	});
	expect(res.ok, await res.clone().text()).toBe(true);
}

/** Runs SQL against the test database. */
export const sql = (statement: string) =>
	execFileSync('docker', ['exec', 'qotm-test-database', 'psql', '-U', 'root', '-d', 'main', '-Atc', statement], {
		encoding: 'utf8'
	}).trim();

export const home = () => tempDir('qotm-e2e-');
