import { processIo } from './io.js';
import { main } from './main.js';

// The binary: run the command, then exit with its code (after output drains).
const code = await main(process.argv.slice(2), processIo());
process.exitCode = code;
