import { setting } from './config.js';
import { CliError, type Io } from './io.js';
import { VERSION } from './version.js';

export type ApiResponse<T> = { status: number; headers: Headers; body: T };

/** A call to the qotm API: JSON, User-Agent qotm/<version>, a timeout, and errors in words. */
export async function api<T>(
	io: Io,
	path: string,
	init: {
		method?: string;
		body?: unknown;
		token?: string | null;
		headers?: Record<string, string>;
		timeoutMs?: number;
	} = {}
): Promise<ApiResponse<T>> {
	const base = setting(io, 'api');
	let res: Response;
	try {
		res = await fetch(`${base}${path}`, {
			method: init.method ?? 'GET',
			headers: {
				'user-agent': `qotm/${VERSION}`,
				accept: 'application/json',
				...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
				...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
				...init.headers
			},
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
			signal: AbortSignal.timeout(init.timeoutMs ?? 15_000)
		});
	} catch (err) {
		const cause = String((err as { cause?: unknown }).cause ?? '');
		if (/bad port/i.test(cause))
			throw new CliError(
				`${base}: fetch refuses that port (a "bad port" in the Fetch standard); use another, or the https address.`
			);
		const why = (err as Error).name === 'TimeoutError' ? 'it did not answer in time' : 'it could not be reached';
		throw new CliError(`${base}: ${why}. Check your connection, or qotm config get api.`);
	}
	const text = await res.text();
	let body: unknown = text;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		/* not JSON: keep the text */
	}
	return { status: res.status, headers: res.headers, body: body as T };
}

/** The API's own message for a failed call ({ statusCode, message }), or the status. */
export function apiMessage(res: ApiResponse<unknown>): string {
	const m = (res.body as { message?: unknown } | null)?.message;
	return typeof m === 'string' ? m : Array.isArray(m) ? m.join('; ') : `HTTP ${res.status}`;
}
