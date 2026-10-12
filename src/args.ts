import { parseArgs, type ParseArgsConfig } from 'node:util';
import { CliError } from './io.js';

/** node:util parseArgs, with its errors turned into usage errors (exit 2). */
export function parse<O extends NonNullable<ParseArgsConfig['options']>>(
	args: string[],
	options: O,
	allowPositionals = false
) {
	try {
		return parseArgs({ args, options, allowPositionals, strict: true });
	} catch (err) {
		throw new CliError(`${(err as Error).message.replace(/\. To specify.*$/s, '')}. Run qotm --help.`, 2);
	}
}
