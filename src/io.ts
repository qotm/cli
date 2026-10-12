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
};

export const processIo = (): Io => ({
	stdout: (text) => void process.stdout.write(text),
	stderr: (text) => void process.stderr.write(text),
	env: process.env,
	isTTY: Boolean(process.stdout.isTTY),
	columns: process.stdout.columns
});

/** A failure the user can act on: printed without a stack, with this exit code. */
export class CliError extends Error {
	constructor(
		message: string,
		readonly exitCode = 1
	) {
		super(message);
	}
}
