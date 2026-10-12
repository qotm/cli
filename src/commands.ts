import { add, favorites, save, unsave } from './commands/local.js';
import { login, logout } from './commands/login.js';
import { last, quote } from './commands/quote.js';
import { submit } from './commands/submit.js';
import { sync } from './commands/sync.js';
import { config, doctor, open, search, status } from './commands/tools.js';
import type { Io } from './io.js';

/** One `qotm <name>` command. `run` receives the arguments after the name. */
export type Command = {
	name: string;
	/** "qotm sync [--force]": shown in `qotm help <name>`. */
	usage: string;
	/** One line, for the command list. */
	summary: string;
	/** More detail for `qotm help <name>`. */
	help?: string;
	run: (args: string[], io: Io) => Promise<number> | number;
};

/** Every command, in the order `qotm --help` lists them. Each ticket adds its own. */
export const COMMANDS: Command[] = [
	quote,
	last,
	save,
	unsave,
	favorites,
	add,
	submit,
	open,
	search,
	sync,
	login,
	logout,
	status,
	config,
	doctor
];

/** What `qotm` with no command runs. */
export const DEFAULT_COMMAND = quote;
