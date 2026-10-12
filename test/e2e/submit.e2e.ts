import { describe, expect, it } from 'vitest';
import { decide, home, MEMBER, qotm, signIn, sql, startLogin } from './helpers.js';

describe('qotm submit against the test API', () => {
	it('checks for a match, submits for review, and keeps private quotes in the account', async () => {
		const h = home();
		const cookie = await signIn();
		const login = startLogin(h);
		await decide(cookie, await login.code, 'approve');
		expect((await login.done).code).toBe(0);

		// The seeded Dijkstra quote is on qotm already.
		const check = qotm(h, 'submit', '--check', 'Simplicity is prerequisite for reliability.');
		expect(check.out).toMatch(/possible match \((the same words|\d+% similar)\): q_8f2k1c/);

		const text = `Weeks of coding can save you hours of planning, again (${Date.now()}).`;
		const submitted = qotm(h, 'submit', text, '--author', 'Unknown', '--source', 'Folklore', '--topic', 'programming');
		expect(submitted.code).toBe(0);
		const id = /submitted (q_[a-z0-9]+)/.exec(submitted.out)![1]!;
		expect(
			sql(
				`SELECT q.status || '|' || q.type || '|' || u.email FROM quotes q JOIN "user" u ON u.id = q.contributor_id WHERE q.public_id = '${id}'`
			)
		).toBe(`SUBMITTED|CANONICAL|${MEMBER.email}`);

		// Field-by-field problems, before anything is sent.
		const bad = qotm(h, 'submit', 'Hm', '--topic', 'programming');
		expect(bad.code).toBe(2);
		expect(bad.out).toContain('  text    give the quote, at least 3 characters');
		expect(bad.out).toContain('  author  who said or wrote it');

		const added = qotm(h, 'add', `Name things twice (${Date.now()}).`);
		const remote = /private quotes \((q_[a-z0-9]+)\)/.exec(added.out)![1]!;
		expect(sql(`SELECT status || '|' || type FROM quotes WHERE public_id = '${remote}'`)).toBe('PRIVATE|PRIVATE');
	}, 60_000);
});
