import { processIo } from './io.js';
import { main } from './main.js';

// node:sqlite still announces itself as experimental on Node 22 and 24; that
// is noise for someone asking for a quote. Every other warning still prints.
process.removeAllListeners('warning');
process.on('warning', (w) => {
	if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
	process.stderr.write(`${w.name}: ${w.message}\n`);
});

// The binary: run the command, then exit with its code (after output drains).
const code = await main(process.argv.slice(2), processIo());
process.exitCode = code;
