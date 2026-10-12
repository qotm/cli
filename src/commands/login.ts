import { hostname } from 'node:os';
import { parse } from '../args.js';
import type { Command } from '../commands.js';
import { setting } from '../config.js';
import { openDataset } from '../dataset.js';
import { api, apiMessage } from '../http.js';
import { CliError, type Io } from '../io.js';
import { style, useColor } from '../output.js';
import { qotmPaths } from '../paths.js';
import { clearSession, readSession, writeSession } from '../state.js';

export const CLIENT_ID = 'qotm-cli';
const GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

type DeviceCode = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval: number;
};

/** How this terminal is listed in Settings › Terminals: "MacBook · zsh". */
export function deviceLabel(env: Io['env'], host = hostname()): string {
	// The last part of a path, on any platform's separators.
	const base = (p: string) =>
		p
			.split(/[\\/]/)
			.pop()!
			.replace(/\.exe$/i, '');
	const shellPath = env.SHELL || env.ComSpec || env.COMSPEC;
	const shell = shellPath ? base(shellPath) : 'terminal';
	const name = host.replace(/\.local$/, '') || 'this computer';
	return `${name} · ${shell}`.slice(0, 80);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The dataset this terminal holds, for X-Qotm-Dataset (Settings › Terminals shows it). */
function heldVersion(io: Io): string | undefined {
	try {
		const { dataset } = openDataset(qotmPaths(io.env).data);
		const v = dataset.meta.version;
		dataset.close();
		return /^v\d{4}\.\d{2}\.\d+$/.test(v) ? v : undefined;
	} catch {
		return undefined;
	}
}

/**
 * `qotm login`: the device authorization grant (BUILD-PLAN §5). Prints a
 * code, opens the browser at /device, polls until the member approves,
 * then registers this terminal and keeps its session token.
 */
export const login: Command = {
	name: 'login',
	usage: 'qotm login [--no-browser] [--force]',
	summary: 'sign in to sync favorites and submit quotes',
	help: `
Prints a code and opens qotm.dev/device in your browser; approve it there
and this terminal is signed in. It is listed under Settings › Terminals.

  --no-browser   only print the address (for a remote shell)
  --force        sign in again, replacing the current session
`,
	async run(args, io) {
		const { values: v } = parse(args, { 'no-browser': { type: 'boolean' }, force: { type: 'boolean' } });
		const { config } = qotmPaths(io.env);
		const current = readSession(config);
		if (current && !v.force)
			throw new CliError(`Already signed in as @${current.handle ?? '?'}. qotm logout first, or qotm login --force.`);
		const color = useColor(io);
		const muted = style.muted(color);

		const start = await api<DeviceCode & { message?: string }>(io, '/auth/device/code', {
			method: 'POST',
			body: { client_id: CLIENT_ID }
		});
		if (start.status !== 200) throw new CliError(`Sign-in could not start: ${apiMessage(start)}.`);
		const code = start.body;
		const where = code.verification_uri_complete ?? code.verification_uri;

		io.stdout(`To sign in, open ${code.verification_uri} and enter:\n\n    ${style.bold(color)(code.user_code)}\n\n`);
		if (!v['no-browser'] && io.openUrl) {
			try {
				await io.openUrl(where);
				io.stdout(muted('opened in your browser; waiting for you to approve…\n'));
			} catch {
				io.stdout(muted(`could not open a browser; go to ${where}\n`));
			}
		} else io.stdout(muted('waiting for you to approve…\n'));

		// Poll at the interval the API asked for; slow down when it says so.
		let interval = Math.max(0, code.interval) * 1000;
		const deadline = Date.now() + code.expires_in * 1000;
		let token: string | null = null;
		while (!token) {
			if (Date.now() > deadline) throw new CliError('The code expired before it was approved. Run qotm login again.');
			await sleep(interval);
			const res = await api<{ access_token?: string; error?: string; error_description?: string }>(
				io,
				'/auth/device/token',
				{
					method: 'POST',
					body: { grant_type: GRANT, device_code: code.device_code, client_id: CLIENT_ID }
				}
			);
			if (res.status === 200 && res.body.access_token) token = res.body.access_token;
			else if (res.body?.error === 'authorization_pending') continue;
			else if (res.body?.error === 'slow_down') interval += 5000;
			else if (res.body?.error === 'expired_token')
				throw new CliError('The code expired before it was approved (codes last 15 minutes). Run qotm login again.');
			else if (res.body?.error === 'access_denied')
				throw new CliError('Sign-in was denied in the browser. Nothing changed here.');
			else throw new CliError(`Sign-in failed: ${res.body?.error_description ?? res.body?.error ?? apiMessage(res)}.`);
		}

		const me = await api<{ handle?: string }>(io, '/v1/me', { token });
		if (me.status !== 200) throw new CliError(`Signed in, but the account could not be read: ${apiMessage(me)}.`);
		const dataset = heldVersion(io);
		const device = await api<{ id?: string }>(io, '/v1/me/devices', {
			method: 'POST',
			token,
			body: { label: deviceLabel(io.env) },
			headers: dataset ? { 'x-qotm-dataset': dataset } : {}
		});
		if (device.status !== 200 && device.status !== 201)
			throw new CliError(`Signed in, but this terminal could not be registered: ${apiMessage(device)}.`);

		writeSession(config, {
			token,
			handle: me.body.handle ?? null,
			deviceId: device.body.id ?? null,
			api: setting(io, 'api'),
			signedInAt: new Date().toISOString()
		});
		io.stdout(`signed in as @${me.body.handle}. ${muted('This terminal is listed under Settings › Terminals.')}\n`);
		return 0;
	}
};

/** `qotm logout`: revoke this terminal; local quotes, favorites and the dataset stay. */
export const logout: Command = {
	name: 'logout',
	usage: 'qotm logout',
	summary: 'sign out and revoke this terminal',
	help: 'Your local quotes, favorites and dataset stay on this machine.',
	async run(args, io) {
		parse(args, {});
		const { config } = qotmPaths(io.env);
		const session = readSession(config);
		if (!session) {
			io.stdout('not signed in\n');
			return 0;
		}
		const muted = style.muted(useColor(io));
		let note = '';
		try {
			const res = await api(io, '/v1/me/devices/current', { method: 'DELETE', token: session.token });
			// 401: already revoked from Settings, or expired. Either way it is over.
			if (res.status !== 200 && res.status !== 204 && res.status !== 401)
				note = ` The API answered ${res.status}; revoke it from Settings › Terminals if it is still listed.`;
		} catch {
			note = ' The API could not be reached; revoke it from Settings › Terminals.';
		}
		clearSession(config);
		io.stdout(`signed out. ${muted(`Your local quotes, favorites and dataset stay.${note}`)}\n`);
		return 0;
	}
};
