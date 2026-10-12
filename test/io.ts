import type { Io } from '../src/io.js';

/** An in-memory Io: run a command in-process and read what it printed. */
export function testIo(env: Record<string, string | undefined> = {}, isTTY = false) {
	const out: string[] = [];
	const err: string[] = [];
	const io: Io = { stdout: (t) => void out.push(t), stderr: (t) => void err.push(t), env, isTTY };
	return { io, out: () => out.join(''), err: () => err.join('') };
}
