// What `npm i -g qotm` would get: pack the package, check the tarball holds
// only what it should, install it globally into a scratch prefix, and run the
// installed `qotm --help`. Run after `yarn build`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ALLOWED = [/^package\.json$/, /^README\.md$/, /^LICENSE$/, /^dist\//, /^data\//];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const scratch = mkdtempSync(join(tmpdir(), 'qotm-pack-'));
const run = (cmd, args, opts = {}) =>
	execFileSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', ...opts });

try {
	// npm ≤ 10 prints an array of packages, npm 11 an object keyed by name.
	const json = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', scratch]));
	const packed = Array.isArray(json) ? json[0] : Object.values(json)[0];
	const files = packed.files.map((f) => f.path);
	const stray = files.filter((f) => !ALLOWED.some((re) => re.test(f)));
	if (stray.length) throw new Error(`The tarball holds files it should not: ${stray.join(', ')}`);
	if (!files.includes('dist/cli.js')) throw new Error('The tarball has no dist/cli.js: run yarn build first.');

	const prefix = join(scratch, 'global');
	run(npm, ['install', '--global', '--prefix', prefix, '--no-audit', '--no-fund', join(scratch, packed.filename)]);
	const bin = process.platform === 'win32' ? join(prefix, 'qotm.cmd') : join(prefix, 'bin', 'qotm');
	const help = run(bin, ['--help']);
	if (!help.includes('Usage:')) throw new Error(`qotm --help printed something else:\n${help}`);

	// A fresh install shows a quote with the network refused (from the bundled snapshot).
	const noNetwork = pathToFileURL(fileURLToPath(new URL('../test/no-network.mjs', import.meta.url))).href;
	const quote = run(bin, [], {
		env: { ...process.env, QOTM_HOME: join(scratch, 'home'), NODE_OPTIONS: `--import=${noNetwork}` }
	});
	if (!/\n— .+\n$/.test(quote)) throw new Error(`qotm printed no quote offline:\n${quote}`);
	console.log(
		`ok: ${packed.filename} (${files.length} files, ${packed.size} bytes) installs, runs qotm --help, and shows a quote offline:`
	);
	console.log(quote.replace(/^/gm, '    ').trimEnd());
	for (const f of files) console.log(`  ${f}`);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
