import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_V1 } from './datasets.js';

const SOURCE = new URL('../../backend/apps/worker/src/dataset/schema.ts', import.meta.url);

describe('the test fixtures’ dataset schema', () => {
	// The backend is beside the CLI in the project space, not in the CLI's own CI.
	it.skipIf(!existsSync(SOURCE))('matches the source of truth in the worker', () => {
		const source = /export const SCHEMA = `\n([\s\S]*?)`;/
			.exec(readFileSync(SOURCE, 'utf8'))![1]!
			.replace('${SCHEMA_VERSION}', '1');
		expect(SCHEMA_V1.replace(/^--.*\n--.*\n/, '')).toBe(source);
	});
});
