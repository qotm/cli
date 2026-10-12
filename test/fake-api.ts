import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Seen = { method: string; path: string; headers: IncomingMessage['headers']; body: unknown };
type Handler = (req: Seen) => { status?: number; body?: unknown; headers?: Record<string, string> } | undefined;

/** A stand-in API for unit tests: routes by "METHOD /path", records every request. */
export async function fakeApi(routes: Record<string, Handler>) {
	const seen: Seen[] = [];
	const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
		let raw = '';
		req.on('data', (c) => (raw += c));
		req.on('end', () => {
			const path = req.url ?? '/';
			const entry: Seen = {
				method: req.method ?? 'GET',
				path,
				headers: req.headers,
				body: raw ? JSON.parse(raw) : undefined
			};
			seen.push(entry);
			const handler = routes[`${entry.method} ${path.split('?')[0]}`];
			const out = handler?.(entry) ?? { status: 404, body: { statusCode: 404, message: 'Not Found' } };
			res.writeHead(out.status ?? 200, { 'content-type': 'application/json', ...out.headers });
			res.end(out.body === undefined ? '' : typeof out.body === 'string' ? out.body : JSON.stringify(out.body));
		});
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	return { url, seen, close: () => new Promise<void>((r) => server.close(() => r())) };
}
