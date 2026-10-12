import { defineConfig } from 'vitest/config';

// The e2e suite: the built qotm against the backend's test API (test/e2e/global-setup.ts).
export default defineConfig({
	define: { __QOTM_VERSION__: JSON.stringify('0.0.0-e2e') },
	test: {
		include: ['test/e2e/**/*.e2e.ts'],
		environment: 'node',
		globalSetup: ['test/e2e/global-setup.ts'],
		fileParallelism: false,
		testTimeout: 60_000,
		hookTimeout: 120_000
	}
});
