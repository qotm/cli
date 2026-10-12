import { spawn } from 'node:child_process';
/**
 * Where a command reads and writes. The binary passes the real process; tests
 * pass their own, so every command runs in-process and its output is checked
 * as text.
 */
export type Io = {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	env: Record<string, string | undefined>;
	/** Whether stdout is a terminal (colours, wrapping). */
	isTTY: boolean;
	/** The terminal's width, when it is one. */
	columns?: number;
	/** Opens a URL in the browser (tests pass their own). */
	openUrl?: (url: string) => Promise<void>;
};

export const processIo = (): Io => ({
	stdout: (text) => void process.stdout.write(text),
	stderr: (text) => void process.stderr.write(text),
	env: process.env,
	isTTY: Boolean(process.stdout.isTTY),
	columns: process.stdout.columns,
	openUrl: openInBrowser
});

/** The platform's opener: open (macOS), start (Windows), xdg-open (elsewhere); $BROWSER wins. */
export function openInBrowser(url: string): Promise<void> {
	const [cmd, args] = process.env.BROWSER
		? [process.env.BROWSER, [url]]
		: process.platform === 'darwin'
			? ['open', [url]]
			: process.platform === 'win32'
				? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]]
				: ['xdg-open', [url]];
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
		child.on('error', reject);
		child.on('spawn', () => {
			child.unref();
			resolve();
		});
	});
}

/** A failure the user can act on: printed without a stack, with this exit code. */
export class CliError extends Error {
	constructor(
		message: string,
		readonly exitCode = 1
	) {
		super(message);
	}
}
