import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir, writeDataset } from '../../test/datasets.js';
import { testIo } from '../../test/io.js';
import { main } from '../main.js';

function home() {
	const dir = tempDir();
	mkdirSync(join(dir, 'data'), { recursive: true });
	writeDataset(join(dir, 'data', 'qotm.sqlite'));
	return { QOTM_HOME: dir };
}

async function run(env: Record<string, string>, ...argv: string[]) {
	const t = testIo(env);
	const code = await main(argv, t.io);
	return { code, out: t.out(), err: t.err() };
}

describe('save, unsave, favorites', () => {
	it('saves the last quote, once, as on the landing page', async () => {
		const env = home();
		expect((await run(env, 'save')).err).toContain('Nothing to save yet. Run qotm for a quote, then qotm save.');
		const shown = JSON.parse((await run(env, '--json')).out);
		expect(await run(env, 'save')).toMatchObject({ code: 0, out: 'saved to favorites\n' });
		expect(await run(env, 'save')).toMatchObject({ code: 0, out: 'already in your favorites\n' });
		const list = await run(env, 'favorites');
		expect(list.out).toBe(`${shown.id}  ${shown.text} — ${shown.author?.name ?? `@${shown.contributor}`}\n`);
	});

	it('saves and unsaves by id, with or without q_', async () => {
		const env = home();
		expect((await run(env, 'save', '8f2k1c')).out).toBe('saved to favorites\n');
		expect((await run(env, 'save', 'q_8f2k1c')).out).toBe('already in your favorites\n');
		expect(JSON.parse((await run(env, 'favorites', '--json')).out)).toMatchObject([
			{ id: 'q_8f2k1c', text: 'Simplicity is prerequisite for reliability.', author: 'Edsger W. Dijkstra' }
		]);
		expect((await run(env, 'unsave', 'q_8f2k1c')).out).toBe('removed from favorites\n');
		expect((await run(env, 'unsave', 'q_8f2k1c')).out).toBe('not in your favorites\n');
		expect((await run(env, 'favorites')).out).toBe('No favorites yet. Save the last quote with qotm save.\n');
		expect((await run(env, 'save', 'not an id!')).code).toBe(2);
	});

	it('lists a favorite that is not in this dataset, saying so', async () => {
		const env = home();
		await run(env, 'save', 'q_zz9zz9');
		expect((await run(env, 'favorites')).out).toBe('q_zz9zz9  not in this dataset (run qotm sync)\n');
	});
});

describe('add', () => {
	it('keeps a private quote that qotm --personal then shows', async () => {
		const env = home();
		const r = await run(env, 'add', 'Name', 'things', 'twice.', '--author', 'Ada', '--year', '2026');
		expect(r.out).toMatch(
			/^kept as a private quote \(p_[a-z0-9]{8}\)\. qotm --personal shows your private quotes\.\n$/
		);
		expect(JSON.parse((await run(env, '--personal', '--json')).out)).toMatchObject({
			text: 'Name things twice.',
			type: 'personal',
			author: { name: 'Ada', slug: null },
			year: 2026
		});
		expect((await run(env, 'save')).err).toContain('one of your private quotes');
	});

	it('wants the text, a real year, and at most 280 characters', async () => {
		const env = home();
		expect((await run(env, 'add')).code).toBe(2);
		expect((await run(env, 'add', 'x', '--year', 'soon')).err).toContain('--year is a year');
		expect((await run(env, 'add', 'x'.repeat(281))).err).toContain('at most 280');
	});
});
