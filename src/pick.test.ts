import { describe, expect, it } from 'vitest';
import { closest, pick } from './pick.js';

describe('pick', () => {
	it('never repeats a recent quote while others are left', () => {
		expect(pick(['a', 'b', 'c'], ['a', 'b'], () => 0.99)).toBe('c');
		expect(pick(['a', 'b', 'c'], [], () => 0)).toBe('a');
	});

	it('falls back to the one shown longest ago when all were recent', () => {
		expect(pick(['a', 'b', 'c'], ['b', 'c', 'a'])).toBe('a');
		expect(pick(['a', 'b'], ['b', 'x', 'a', 'y'])).toBe('a');
	});

	it('has nothing to pick from nothing', () => {
		expect(pick([], ['a'])).toBeNull();
	});

	it('suggests the nearest slug', () => {
		expect(closest('debuging', ['debugging', 'unix'])).toBe('debugging');
		expect(closest('dikstra', ['dijkstra', 'knuth'])).toBe('dijkstra');
		expect(closest('zzz', ['debugging', 'unix'])).toBeNull();
	});
});
