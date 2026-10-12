import type { Command } from '../commands.js';
import { openDataset } from '../dataset.js';
import { CliError } from '../io.js';
import { qotmPaths } from '../paths.js';

/** `qotm`: one quote from the local dataset. QOT-107 adds the variety, flags and formatting. */
export const quote: Command = {
	name: 'quote',
	usage: 'qotm',
	summary: 'print a quote (the default)',
	run(_args, io) {
		const { dataset, warning } = openDataset(qotmPaths(io.env).data);
		try {
			if (warning) io.stderr(`qotm: ${warning}\n`);
			const q = dataset.random();
			if (!q) throw new CliError('the dataset has no quotes. Run qotm sync.');
			io.stdout(`${q.text}\n— ${q.author ?? (q.contributor ? `@${q.contributor}` : 'a former member')}\n`);
			return 0;
		} finally {
			dataset.close();
		}
	}
};
