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
yarn test:e2e       # the built qotm against the backend's test API (see below)
yarn test:pack      # npm pack, global install into a scratch prefix, run qotm --help and qotm offline
node scripts/snapshot.mjs [--api <url> | --from <file>]   # refresh data/qotm.sqlite (the bundled snapshot)
node dist/cli.js    # run the build
```

**The e2e suite** (`vitest.e2e.config.ts`, `test/e2e/*.e2e.ts`) builds the
CLI, reseeds the backend's test database (`yarn test:db:seed:e2e` in
`../backend/apps/api`), flushes the test Redis, and starts the API from its
compiled build with `.env.test` on port 5170 (password sign-in on, so the
tests approve device codes as the seeded member). A local server on 5171 stands in for the releases host (`RELEASES_BASE_URL`):
setup writes the current release's file there and sets its sha256 and size in
the test database; tests reach the folder with `inject('releases')`. It needs
the backend's test
stack up (`yarn test:dc:up` there) and `backend/apps/api/dist` built.
Never run it alongside the backend's or web's e2e suites: they share the test
database.

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
- `src/config.ts`: settings.json in the config folder (api, site, color,
  style, history), with env overrides (`QOTM_API_URL`, `QOTM_SITE_URL`).
- `src/render.ts`: how a quote is drawn on a terminal, in four styles (pull,
  the default; bubble; card; slab), as designed on the "CLI render" page of
  the Paper file qotm_mail. Balanced wrapping, 60 columns at most, no shape
  under 40 columns; `src/quotes.ts` (`formatQuote`) decides shaped or plain.
  `src/__snapshots__/` holds each style's drawing: review a changed snapshot
  as a design change.
- `src/http.ts`: `api()`, the one way to call the API (User-Agent
  `qotm/<version>`, JSON, timeouts, errors in words). Node's fetch refuses the
  Fetch spec's "bad ports" (5060, the dev API's, is one): point the CLI at
  `https://api.qotm.site` or the test API on 5160 instead.
- `src/state.ts`: session.json (config folder, mode 0600: the bearer token)
  and sync.json (data folder).
- `src/commands/sync.ts`: the manifest (If-None-Match with the held
  release's ETag; X-Qotm-Dataset and the bearer when signed in), a streamed
  download into `qotm.sqlite.download-<pid>` hashed as it arrives, size,
  sha256 and schema checks, then one rename over `qotm.sqlite` and
  sync.json. Nothing touches the current file until the new one is proven.
- `src/favorites-sync.ts`: `PUT /v1/me/favorites/sync` with the queued adds
  and removes (favorites.json `pending`), then the account's merged set
  becomes the local list; skipped ids stay as `localOnly`. Run by `sync`,
  right after `login`, and by `save` / `unsave` (3 s timeout; offline, the
  queue waits).
- `src/commands/login.ts`: the device flow (BUILD-PLAN §5): code, browser,
  poll at the API's interval (slow_down adds 5s), /v1/me, register the
  terminal with its label and X-Qotm-Dataset, keep the session. Logout
  revokes `/v1/me/devices/current` and keeps everything local.
- `src/io.ts`: `Io` (stdout, stderr, env, isTTY, columns, openUrl) and `CliError` (a message
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

## CI and releases (GitHub: qotm/cli)

- `.github/workflows/ci.yml`: every push and pull request, on Linux, macOS
  and Windows with Node 22.13 and 24: typecheck, lint, format, build, test,
  `test:pack`.
- `.github/workflows/release.yml`: a `v*` tag publishes. It reruns CI, checks
  the tag equals `package.json`'s version, bundles the latest production
  dataset release (`scripts/snapshot.mjs`), builds, tests, publishes to npm
  through Trusted Publishing (no token; provenance attached) from the `npm`
  environment (deployable from `v*` tags only), and creates the GitHub
  release. A version with a `-` (`2.1.0-beta.1`) goes to the `next`
  dist-tag. To release: `npm version <patch|minor|major>` on `main`, then
  `git push --follow-tags`. A published version can never be replaced, only
  followed by a new one.
