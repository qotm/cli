import { describe, expect, it } from 'vitest';
import { apiFieldError, body, cleanText, topicList, validate } from './submission.js';

const canonical = {
	original: false,
	text: '“Premature optimization is the root of all evil.”',
	author: 'Donald E. Knuth',
	source: 'Structured Programming with go to Statements',
	topics: ['programming']
};

describe('submission rules', () => {
	it('cleans the words as the API does', () => {
		expect(cleanText('  “Talk is   cheap.”  ')).toBe('Talk is cheap.');
		expect(topicList(['programming,debugging', 'debugging', ' unix '])).toEqual(['programming', 'debugging', 'unix']);
	});

	it('accepts a complete canonical quote and builds its body', () => {
		expect(validate({ ...canonical, year: '1974', url: 'https://dl.acm.org/doi/10.1145/356635.356640' })).toEqual({});
		expect(body({ ...canonical, year: '1974' })).toEqual({
			type: 'canonical',
			text: 'Premature optimization is the root of all evil.',
			attribution: 'Donald E. Knuth',
			source: 'Structured Programming with go to Statements',
			year: 1974,
			topics: ['programming']
		});
	});

	it('names every problem, field by field', () => {
		expect(validate({ original: false, text: 'x', topics: [], year: 'soon', url: 'ftp://x' })).toEqual({
			text: 'give the quote, at least 3 characters',
			topic: 'choose at least one topic (--topic debugging)',
			author: 'who said or wrote it (--author "Donald E. Knuth")',
			source: 'where it was said or written (--source "Structured Programming with go to Statements")',
			year: 'a year, like 1974',
			url: 'a link to the source, starting with https://'
		});
		expect(validate({ ...canonical, text: 'x'.repeat(281), topics: ['a', 'b', 'c', 'd'] })).toMatchObject({
			text: 'at most 280 characters (this is 281)',
			topic: 'at most three topics'
		});
		expect(validate(canonical, ['debugging', 'unix']).topic).toBe(
			'unknown topic programming (qotm search --web, or: debugging, unix)'
		);
	});

	it('an original needs the rights box and no author or source', () => {
		expect(
			validate({ original: true, text: 'Ship the smallest thing that teaches you something.', topics: ['programming'] })
		).toEqual({
			rights: 'confirm you wrote this quote and may publish it (--rights)'
		});
		expect(
			validate({ original: true, text: 'Mine.', author: 'Me', topics: ['programming'], rights: true }).author
		).toContain('an original is yours');
		expect(body({ original: true, text: 'Ship small.', topics: ['programming'], rights: true })).toEqual({
			type: 'original',
			text: 'Ship small.',
			topics: ['programming'],
			rights: true
		});
	});

	it('reads the API’s validation message as a field', () => {
		expect(apiFieldError('Validation: attribution: Too small: expected string to have >=2 characters')).toEqual([
			'author',
			'Too small: expected string to have >=2 characters'
		]);
		expect(apiFieldError('Validation: topics - unknown topic nope')).toEqual(['topic', 'unknown topic nope']);
		expect(apiFieldError('Conflict')).toBeNull();
	});
});
