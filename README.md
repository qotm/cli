# qotm

One considered programming quote in your terminal, from a community that
verifies and curates them at [qotm.dev](https://qotm.dev).

```sh
npm i -g qotm
qotm
```

Requires Node.js 22.13 or later. No account and no network on the default
path: quotes come from a local copy of the curated dataset, which ships with
the package.

## Reading quotes

```sh
qotm                          # a quote, avoiding the last 50 shown
qotm --topic debugging        # from one topic
qotm --author dijkstra        # by one author
qotm --favorites              # from your favorites
qotm --personal               # from your private quotes
qotm --source                 # with where it is from
qotm last                     # the previous quote again
```

## Favorites and private quotes

These work signed out and offline, kept on this machine:

```sh
qotm save                     # favorite the last quote ("saved to favorites")
qotm save q_8f2k1c            # or one by id
qotm unsave                   # take the last quote (or <id>) out again
qotm favorites                # list them (--json for a list of objects)
qotm add "Name things twice." --author Ada   # keep a private quote
qotm --personal               # a quote from your private quotes
```

Saving a quote twice changes nothing. Once you are signed in, `qotm sync`
shares favorites with your account.

## More

```sh
qotm open                     # the last quote's page on qotm.dev ("opening q/1t7c4e in your browser")
qotm search complexity        # search your dataset, offline (--web: on qotm.dev; --json)
qotm status                   # dataset version, last sync, account, counts (--json)
qotm config                   # settings: api, site, color, history (get / set / unset; --json)
qotm doctor                   # check Node, folders, the dataset's sha256 and the API (--json)
```

`qotm doctor` exits 1 and names the problem when a check fails.
`QOTM_API_URL` and `QOTM_SITE_URL` override the api and site settings for
one run.

Output is coloured on a terminal and plain when piped. `--plain` forces
plain text (no colour, no wrapping); `NO_COLOR` and `TERM=dumb` are honoured.

### `--json`

`qotm --json` and `qotm last --json` print one object:

```json
{
	"id": "q_8f2k1c",
	"text": "Simplicity is prerequisite for reliability.",
	"type": "canonical",
	"author": { "name": "Edsger W. Dijkstra", "slug": "dijkstra" },
	"contributor": "kofi",
	"work": "EWD 498",
	"year": 1975,
	"source": "EWD 498: How do we tell truths that might hurt?",
	"sourceUrl": "https://www.cs.utexas.edu/~EWD/transcriptions/EWD04xx/EWD498.html",
	"topics": ["simplicity"],
	"url": "https://qotm.dev/q/8f2k1c",
	"dataset": "v2026.09.1"
}
```

- `type`: `canonical` (attributed to an author), `original` (a member's own
  words; `author` is null and `contributor` is the member's handle, or null
  for a former member) or `personal` (one of your private quotes: `url` and
  `dataset` are null).
- `work`, `year`, `source`, `sourceUrl` are null when not on record.

## Where qotm keeps things

|                             | Linux                 | macOS                                | Windows                    |
| --------------------------- | --------------------- | ------------------------------------ | -------------------------- |
| settings, session           | `~/.config/qotm`      | `~/Library/Preferences/qotm`         | `%APPDATA%\qotm\Config`    |
| dataset, favorites, history | `~/.local/share/qotm` | `~/Library/Application Support/qotm` | `%LOCALAPPDATA%\qotm\Data` |

`XDG_CONFIG_HOME` and `XDG_DATA_HOME` are honoured; `QOTM_HOME` puts both
under one folder.

## License

MIT
