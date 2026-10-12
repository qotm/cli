import { execSync } from 'node:child_process';

/** The binary tests run dist/cli.js: build it first. */
export default function setup() {
	execSync('yarn build', { stdio: 'ignore' });
}
