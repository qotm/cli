# qotm CLI

The `qotm` command-line tool, published to npm as `qotm` (2.x is this
rewrite). It prints a curated programming quote from a local copy of the
dataset (`qotm.sqlite`), and talks to the qotm API only for login, sync,
favorites and submissions. The contract with the API is BUILD-PLAN.md §5
(`../BUILD-PLAN.md`); the dataset schema's source of truth is
`../backend/apps/worker/src/dataset/schema.ts`.

## Commands

```sh
yarn build          # tsup → dist/cli.js (one bundled file, shebang)
yarn typecheck && yarn lint && yarn format:check
yarn test           # Vitest: src/**/*.test.ts, test/**/*.test.ts
yarn test:pack      # npm pack, global install into a scratch prefix, run qotm --help
node dist/cli.js    # run the build
```

## Layout

- `src/cli.ts`: the binary. `src/main.ts`: `main(argv, io)`, the dispatcher
  (help, version, errors). `src/commands.ts`: the command registry.
- `src/io.ts`: `Io` (stdout, stderr, env, isTTY) and `CliError` (a message
  for the user and an exit code). Commands never touch `process` directly,
  so tests run them in-process with `testIo()` from `test/io.ts`.

## Rules

- **No runtime dependencies.** tsup bundles everything into `dist/cli.js`;
  SQLite is Node's built-in `node:sqlite` (hence Node ≥ 22.13), so a global
  install builds nothing.
- **Offline first.** The default path (`qotm`) never touches the network.
- **Errors** are `CliError`s with words the user can act on; exit code 2 is a
  usage error. `QOTM_DEBUG=1` prints stacks for unexpected ones.
- The package ships only `dist/`, `data/` (the dataset snapshot), README and
  LICENSE; `yarn test:pack` enforces it.
