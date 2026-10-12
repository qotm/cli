import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

// One file, `dist/cli.js`, with every dependency bundled: a global install
// pulls nothing at runtime and builds nothing (SQLite is Node's own).
export default defineConfig({
	entry: { cli: 'src/cli.ts' },
	format: 'esm',
	platform: 'node',
	target: 'node22',
	clean: true,
	splitting: false,
	sourcemap: false,
	banner: { js: '#!/usr/bin/env node' },
	define: { __QOTM_VERSION__: JSON.stringify(version) }
});
