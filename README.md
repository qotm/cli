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

Saving a quote twice changes nothing. Signed in, favorites are shared with
your account: a save or unsave goes up straight away, or, offline, waits for
the next `qotm sync`, which also brings down the favorites you added on
qotm.dev.

## Updating the quotes

```sh
qotm sync                     # fetch the latest dataset release
```

`qotm sync` checks the download against the release manifest (size and
sha256) and replaces your copy in one step: an interrupted or mismatched
download leaves your quotes as they were. It asks with the version it holds,
so an up-to-date copy costs one small request.

## Your account

```sh
qotm login                    # sign in: approve the printed code at qotm.dev/device
qotm logout                   # sign out and revoke this terminal
```

Signing in lists this terminal under Settings › Terminals on qotm.dev.
Signing out keeps your local quotes, favorites and dataset.

## Submitting

```sh
qotm submit "Premature optimization is the root of all evil." \
  --author "Donald E. Knuth" --source "Structured Programming with go to Statements" \
  --year 1974 --topic programming          # a canonical quote: a verifier checks the source
qotm submit --original "Ship the smallest thing that teaches you something." \
  --topic software-engineering --rights    # your own words
qotm submit p_ab12cd34 --topic learning --rights   # one of your private quotes, as your original
qotm submit --check "Make it work, make it right, make it fast."   # does qotm have it already?
```

Submitting needs `qotm login`. Every missing or invalid field is listed at
once; the match against quotes already on qotm is shown before sending.
Signed in, `qotm add` also keeps the quote in your account's private quotes.

## More

```sh
qotm open                     # the last quote's page on qotm.dev ("opening q/1t7c4e in your browser")
qotm search complexity        # search your dataset, offline (--web: on qotm.dev; --json)
qotm status                   # dataset version, last sync, account, counts (--json)
qotm config                   # settings: api, site, color, style, history (get / set / unset; --json)
qotm doctor                   # check Node, folders, the dataset's sha256 and the API (--json)
```

`qotm doctor` exits 1 and names the problem when a check fails.
`QOTM_API_URL` and `QOTM_SITE_URL` override the api and site settings for
one run.

### How a quote looks

On a terminal, a quote is drawn in one of four styles: box-drawing and block
characters, no extra tools.

```sh
qotm config set style pull    # the default: clay quote marks beside the words
qotm config set style bubble  # a speech bubble with the qotm "q" (cowsay's heir)
qotm config set style card    # a centred card, its id and status in the edge
qotm config set style slab    # a lighter panel with a clay edge (best in colour)
qotm --style card             # one style, this once
```

The shape fits the quote: lines wrap at 60 columns at most, never past the
terminal, and are balanced so no word sits alone on the last line. Narrower
than 40 columns, the quote prints without a shape.

Output is coloured on a terminal and plain when piped (the words and the
credit, for scripts and for `qotm | cowsay`). `--plain` forces that plain
text. `NO_COLOR` and `TERM=dumb` drop the colour but keep the shape.

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
