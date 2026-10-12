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
yarn test:pack      # npm pack, global install into a scratch prefix, run qotm --help and qotm offline
node scripts/snapshot.mjs [--api <url> | --from <file>]   # refresh data/qotm.sqlite (the bundled snapshot)
node dist/cli.js    # run the build
```

## Layout

- `src/cli.ts`: the binary. `src/main.ts`: `main(argv, io)`, the dispatcher
  (help, version, errors). `src/commands.ts`: the command registry.
- `src/paths.ts`: the config and data folders (XDG on Linux, Library on
  macOS, AppData on Windows; `QOTM_HOME` overrides both, for tests).
- `src/dataset.ts`: `Dataset` (a read-only `qotm.sqlite`) and `openDataset`:
  the synced file in the data folder, else the bundled snapshot
  (`data/qotm.sqlite`). A missing, corrupt or unknown-schema file falls back
  to the snapshot; only corrupt and schema cases print a warning.
- `test/datasets.ts`: `writeDataset()` builds v1 test files from
  `test/fixtures/schema-v1.sql`, a copy of the worker's schema that
  `test/schema.test.ts` keeps equal. `test/no-network.mjs` (an `--import`
  preload) makes any network access throw.
- `src/io.ts`: `Io` (stdout, stderr, env, isTTY) and `CliError` (a message
  for the user and an exit code). Commands never touch `process` directly,
  so tests run them in-process with `testIo()` from `test/io.ts`.

## Rules

- **No runtime dependencies.** tsup bundles everything into `dist/cli.js`;
  SQLite is Node's built-in `node:sqlite` (hence Node ≥ 22.13), so a global
  install builds nothing.
- **Offline first.** The default path (`qotm`) never touches the network;
  the binary tests run it with `test/no-network.mjs`.
- **Dataset schema 1 only.** A file with another `schemaVersion` is refused
  (the snapshot is used, and the user is told to update qotm).
- tsup keeps the `node:` prefix (`removeNodeProtocol: false`): `sqlite` is a
  builtin only as `node:sqlite`.
- **Errors** are `CliError`s with words the user can act on; exit code 2 is a
  usage error. `QOTM_DEBUG=1` prints stacks for unexpected ones.
- The package ships only `dist/`, `data/` (the dataset snapshot), README and
  LICENSE; `yarn test:pack` enforces it.
