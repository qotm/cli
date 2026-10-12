import { COMMANDS, DEFAULT_COMMAND, type Command } from './commands.js';
import { CliError, type Io } from './io.js';

export const VERSION = __QOTM_VERSION__;

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(1, n - s.length));

export function usage(): string {
	const width = Math.max(10, ...COMMANDS.map((c) => c.name.length)) + 3;
	const commands = COMMANDS.length
		? COMMANDS.map((c) => `  ${pad(c.name, width)}${c.summary}`).join('\n')
		: '  (none yet)';
	return `qotm ${VERSION}: one considered programming quote in your terminal.

Usage:
  qotm <command> [options]

Commands:
${commands}

Options:
  -h, --help     show this help, or a command's: qotm help <command>
  -v, --version  print the version

https://qotm.dev
`;
}

function commandHelp(c: Command): string {
	return `Usage: ${c.usage}\n\n${c.summary}\n${c.help ? `\n${c.help.trim()}\n` : ''}`;
}

const find = (name: string) => COMMANDS.find((c) => c.name === name);

/**
 * Runs `qotm` with these arguments and returns the exit code. The binary
 * (cli.ts) passes process.argv; tests call it directly.
 */
export async function main(argv: string[], io: Io): Promise<number> {
	const [first, ...rest] = argv;
	try {
		if (first === '-v' || first === '--version') {
			io.stdout(`${VERSION}\n`);
			return 0;
		}
		if (first === undefined) return await DEFAULT_COMMAND.run([], io);
		if (first === '-h' || first === '--help') {
			io.stdout(usage());
			return 0;
		}
		if (first === 'help') {
			const target = rest[0] ? find(rest[0]) : undefined;
			if (rest[0] && !target) throw new CliError(`Unknown command "${rest[0]}". Run qotm --help for the list.`, 2);
			io.stdout(target ? commandHelp(target) : usage());
			return 0;
		}
		const command = find(first);
		if (!command) throw new CliError(`Unknown command "${first}". Run qotm --help for the list.`, 2);
		if (rest.includes('-h') || rest.includes('--help')) {
			io.stdout(commandHelp(command));
			return 0;
		}
		return await command.run(rest, io);
	} catch (err) {
		if (err instanceof CliError) {
			io.stderr(`qotm: ${err.message}\n`);
			return err.exitCode;
		}
		io.stderr(`qotm: something went wrong: ${err instanceof Error ? err.message : String(err)}\n`);
		if (io.env.QOTM_DEBUG && err instanceof Error && err.stack) io.stderr(`${err.stack}\n`);
		return 1;
	}
}
