import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir, writeDataset } from '../../test/datasets.js';
import { testIo } from '../../test/io.js';
import { main } from '../main.js';
import { readHistory, writeJson, favoritesFile, personalFile } from '../store.js';

/** A home with the fixture dataset synced into it. */
function home() {
	const dir = tempDir();
	mkdirSync(join(dir, 'data'), { recursive: true });
	writeDataset(join(dir, 'data', 'qotm.sqlite'));
	return { dir, data: join(dir, 'data'), env: { QOTM_HOME: dir } };
}

async function run(env: Record<string, string>, ...argv: string[]) {
	const t = testIo(env);
	const code = await main(argv, t.io);
	return { code, out: t.out(), err: t.err() };
}

describe('qotm', () => {
	it('prints a quote and remembers it', async () => {
		const h = home();
		const r = await run(h.env);
		expect(r.code).toBe(0);
		expect(r.out).toMatch(/^.+\n— {2}.+\n$/);
		expect(readHistory(h.data).shown).toHaveLength(1);
	});

	it('draws the quote in the configured style, or --style for one run', async () => {
		const h = home();
		const tty = async (...argv: string[]) => {
			const t = testIo({ ...h.env, NO_COLOR: '' }, true);
			const code = await main(argv, t.io);
			return { code, out: t.out(), err: t.err() };
		};
		expect((await tty()).out).toContain('▄▄ ▄▄');
		// The quote is random: the fixture holds curated quotes and an original.
		expect((await tty('--style', 'card')).out).toMatch(/✓ (curated|original) ─╯/);
		expect((await tty('config', 'set', 'style', 'bubble')).code).toBe(0);
		expect((await tty()).out).toContain('╰──┬');
		expect((await tty('last', '--style', 'slab')).out).toContain('▌');
		const bad = await tty('--style', 'cow');
		expect(bad.code).toBe(2);
		expect(bad.err).toContain('style is pull, bubble, card or slab.');
		expect((await tty('config', 'set', 'style', 'cow')).code).toBe(2);
	});

	it('does not repeat itself until it has shown everything', async () => {
		const h = home();
		const seen = new Set<string>();
		for (let i = 0; i < 3; i++) seen.add(JSON.parse((await run(h.env, '--json')).out).id);
		expect(seen.size).toBe(3);
	});

	it('filters by topic and author, and suggests a slug it does not know', async () => {
		const h = home();
		for (let i = 0; i < 4; i++)
			expect(['q_1t7c4e', 'q_4r8y1p']).toContain(
				JSON.parse((await run(h.env, '--topic', 'debugging', '--json')).out).id
			);
		expect(JSON.parse((await run(h.env, '--author', 'dijkstra', '--json')).out).id).toBe('q_8f2k1c');
		const bad = await run(h.env, '--topic', 'debuging');
		expect(bad.code).toBe(2);
		expect(bad.err).toContain('No topic "debuging" in your dataset. Did you mean debugging?');
		expect((await run(h.env, '--author', 'nobody')).err).toContain('No author "nobody"');
	});

	it('draws from favorites, saying so when there are none', async () => {
		const h = home();
		expect((await run(h.env, '--favorites')).err).toContain(
			'You have no favorites yet. Save the last quote with qotm save.'
		);
		writeJson(favoritesFile(h.data), { favorites: [{ id: 'q_4r8y1p', addedAt: '2026-10-12T00:00:00Z' }] });
		expect(JSON.parse((await run(h.env, '--favorites', '--json')).out).id).toBe('q_4r8y1p');
	});

	it('draws from private quotes', async () => {
		const h = home();
		expect((await run(h.env, '--personal')).err).toContain('You have no private quotes yet.');
		writeJson(personalFile(h.data), {
			quotes: [
				{
					id: 'p_abc123',
					text: 'Name things twice.',
					author: null,
					work: null,
					year: null,
					createdAt: '2026-10-12T00:00:00Z'
				}
			]
		});
		const r = await run(h.env, '--personal');
		expect(r.out).toBe('Name things twice.\n—  you\n');
		expect(JSON.parse((await run(h.env, 'last', '--json')).out)).toMatchObject({
			id: 'p_abc123',
			type: 'personal',
			url: null,
			dataset: null
		});
		expect((await run(h.env, '--personal', '--favorites')).code).toBe(2);
	});

	it('qotm last shows the same quote again', async () => {
		const h = home();
		expect((await run(h.env, 'last')).err).toContain('Nothing shown yet.');
		const first = await run(h.env, '--json');
		expect(JSON.parse((await run(h.env, 'last', '--json')).out)).toEqual(JSON.parse(first.out));
		expect(readHistory(h.data).shown).toHaveLength(1);
	});

	it('refuses an option it does not know', async () => {
		const h = home();
		const r = await run(h.env, '--colour');
		expect(r.code).toBe(2);
		expect(r.err).toMatch(/Unknown option '--colour'/);
	});
});
