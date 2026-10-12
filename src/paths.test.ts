import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { qotmPaths } from './paths.js';

describe('qotmPaths', () => {
	it('follows XDG on Linux, with its defaults', () => {
		expect(qotmPaths({}, 'linux', '/home/ada')).toEqual({
			config: join('/home/ada', '.config', 'qotm'),
			data: join('/home/ada', '.local', 'share', 'qotm')
		});
		expect(qotmPaths({ XDG_CONFIG_HOME: '/x/conf', XDG_DATA_HOME: '/x/data' }, 'linux', '/home/ada')).toEqual({
			config: join('/x/conf', 'qotm'),
			data: join('/x/data', 'qotm')
		});
	});

	it('uses Library on macOS', () => {
		expect(qotmPaths({}, 'darwin', '/Users/ada')).toEqual({
			config: join('/Users/ada', 'Library', 'Preferences', 'qotm'),
			data: join('/Users/ada', 'Library', 'Application Support', 'qotm')
		});
	});

	it('uses AppData on Windows', () => {
		expect(
			qotmPaths(
				{ APPDATA: 'C:\\Users\\ada\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local' },
				'win32',
				'C:\\Users\\ada'
			)
		).toEqual({
			config: join('C:\\Users\\ada\\AppData\\Roaming', 'qotm', 'Config'),
			data: join('C:\\Users\\ada\\AppData\\Local', 'qotm', 'Data')
		});
		expect(qotmPaths({}, 'win32', 'C:\\Users\\ada').data).toBe(
			join('C:\\Users\\ada', 'AppData', 'Local', 'qotm', 'Data')
		);
	});

	it('puts both under QOTM_HOME when it is set', () => {
		expect(qotmPaths({ QOTM_HOME: '/tmp/q' }, 'darwin', '/Users/ada')).toEqual({
			config: join('/tmp/q', 'config'),
			data: join('/tmp/q', 'data')
		});
	});
});
