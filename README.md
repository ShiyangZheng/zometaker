# Zometaker

> Tidy up the mess that Zotero Connector drags into your library.

A Zotero plugin that does three things to the items in your library:

1. **Auto-update metadata** — checks each item against authoritative
   sources (CrossRef / OpenAlex / DataCite) by DOI, and overwrites any
   field that disagrees.
2. **Standardise style — APA 7th edition** — author names, journal
   names, page ranges, DOIs, publishers and titles are normalised to
   the APA 7 reference-list format.
3. **Fill missing data** — empty fields (volume, issue, pages, ISBN,
   publisher, abstract, …) are populated from the same sources.

Built for Zotero 6 / 7 / 8 / 9. No external dependencies. No API keys.

---

## Why this exists

The Zotero Connector grabs papers from publisher pages, but it grabs
them **fast**, not **cleanly**. Common pain points:

- Author names come back in any of a dozen formats:
  `John Smith`, `Smith, John`, `SMITH, J.`, `J. Smith`, `JOHN MICHAEL SMITH`,
  or `张三`.
- Journals arrive in ALL-CAPS, title case, or sentence case
  (`NATURE`, `Nature`, `nature`).
- Page ranges use hyphens (`123-456`) instead of en-dashes
  (`123–456`).
- DOIs come back as `doi:10.xxxx/...`, `https://doi.org/...`, or just
  the bare string `10.xxxx/...`.
- Required fields (volume, issue, pages, publisher, ISBN) are
  sometimes missing entirely.
- Publisher strings carry the legacy `City, ST: Routledge` format
  from APA 6.

Zometaker fixes all of that in one click, using APA 7 rules from the
[*Publication Manual of the American Psychological Association*,
7th edition (2020)](https://apastyle.apa.org/products/publication-manual-7th-edition)
and Purdue OWL's reference guide.

---

## The reading / citing workflow

Zometaker is half of a two-piece workflow. The other half is
[citationHop](https://github.com/ShiyangZheng/citation-hop), a
macOS menu-bar app that opens the publisher page for whatever item
you're reading in Zotero.

```text
   ┌──────────────────────────────────────────────────────────┐
   │  Reading flow                                            │
   │                                                          │
   │  1. You read a paper in Zotero (PDF reader, item pane).   │
   │  2. A citation in the paper catches your eye.            │
   │  3. Press ⌘⇧L  (citationHop hotkey).                     │
   │     → citationHop reads the selected reference from      │
   │       Zotero, jumps to its DOI / publisher page in       │
   │       your default browser.                              │
   │  4. You read the cited paper on the publisher site.      │
   │  5. Click the Zotero Connector icon in the browser.      │
   │     → the paper lands in Zotero as a new item.          │
   │  6. Run "Update & normalise this collection…"            │
   │     (Tools → Zometaker → run on selection, or right-     │
   │     click the collection).                               │
   │     → Zometaker fetches authoritative metadata for the   │
   │       new item, normalises authors / journal / pages /   │
   │       DOI to APA 7, fills in anything that's still       │
   │       missing.                                           │
   │                                                          │
   │  Result: a clean bibliography without ever leaving the   │
   │          reading flow.                                   │
   └──────────────────────────────────────────────────────────┘
```

| Step | Tool | Action |
| --- | --- | --- |
| 1–2 | **Zotero** | Read the paper; notice a citation of interest. |
| 3 | **citationHop** | Hotkey ⌘⇧L → publisher page in browser. |
| 4 | Browser | Read the cited paper. |
| 5 | **Zotero Connector** | Browser extension → item into Zotero. |
| 6 | **Zometaker** | Right-click the collection → "Update & normalise this collection…". |

Together the three tools form a round-trip: **Zotero → browser → back
to Zotero, with the metadata clean on both ends.**

### Why Zometaker matters for this loop

The Zotero Connector grabs papers from publisher pages fast — but
not cleanly. Common artefact patterns that Zometaker fixes:

| Connector gives you | Zometaker gives you |
| --- | --- |
| `ERMAN, B., & WARREN, B. (2000). The idiom principle...` | `Erman, B., & Warren, B. (2000). The idiom principle...` |
| `Boers, F. (2006). ...Putting a Lexical                 Approach...` | `Boers, F. (2006). ...Putting a Lexical Approach...` |
| `Sonbul, S. (2024). ...L2 <scp>Foo</scp> Bar...` | `Sonbul, S. (2024). ...L2 Foo Bar...` |
| `Swinney, D. A. (1979). ...Memory &amp; Cognition` | `Swinney, D. A. (1979). ...Memory & Cognition` |
| `Titone, D. A. (1999).` (Word cites as `(D. A. Titone, 1999)`) | `Titone, D. A. (1999).` (Word cites as `(Titone, 1999)`) |

---

## Install

### From the .xpi

1. **If you have an older version of Metadata Caretaker installed,
   fully uninstall it first** — right-click the plugin entry in
   **Tools → Plugins** and choose **Remove**. Then restart Zotero.
   (Zotero's XPI cache will otherwise keep reporting errors against
   the old extension id even after you install the new one.)
2. Download `zometaker.xpi` from the
   [Releases page](https://github.com/ShiyangZheng/zometaker/releases).
3. In Zotero: **Tools → Plugins** (gear icon → Install Plugin From File…).
4. Pick the .xpi. Restart Zotero when prompted.

### From source

```bash
git clone https://github.com/ShiyangZheng/zometaker
cd zometaker
./build.sh        # writes ../zometaker.xpi
```

Then install the .xpi as above.

---

## Use

Three menu entries appear under **Tools → Zometaker**:

- **Update & normalise library…** — process every regular item in
  your library.
- **Update & normalise selected items** — process only the items
  currently selected.
- **Update & normalise this collection…** — right-click any
  collection (also accessible from the same Tools menu).
- **Show last Zometaker report** — popup with the summary of the
  last run.
- **Zometaker Settings…** — open the preferences pane.

The preferences pane (Settings → Zometaker) exposes:

- Which API to use as primary / fallback (CrossRef, OpenAlex,
  DataCite).
- **APA 7 mode** (toggle + per-rule list).
- Author-name mode: APA initials (`Smith, J. M.`) vs Title Case
  (`Smith, John Michael`).
- Whether to normalise names, journal names, pages, titles,
  publishers, DOIs.
- Whether to fill missing fields and missing abstracts.
- A **dry-run** toggle (very useful the first time you run on a big
  library — it builds a report without writing anything).
- A requests-per-second cap (CrossRef etiquette suggests ≤ 5/s).
- A contact e-mail that gets included in the `User-Agent` header.

---

## What "APA 7 standardised" means

All rules below are derived from the *Publication Manual of the
American Psychological Association*, 7th edition (2020) and
Purdue OWL's reference guide.

| Rule id | What it checks | Auto-fix |
| --- | --- | --- |
| **R1** | Authors in `Lastname, F. M.` form (not `F. M. Lastname`) | Re-arrange into creator objects |
| **R4** | No all-caps given names | Convert to initials (`JOHN` → `J.`) |
| **R5** | Date present and 4-digit year; otherwise `(n.d.)` | Set `n.d.` when missing |
| **R6** | Article / book title in **sentence case** (only first word, first word after `:`, and proper nouns capitalised) | Convert from Title Case when clearly mostly-caps or has Title-Case tokens |
| **R7** | Journal name in **title case** (major words capitalised, particles lowercase) | Convert from ALL-CAPS |
| **R8** | Volume is numeric; no `Vol.` prefix | Strip `Vol. ` |
| **R9** | Issue is numeric; no `No.` / `Issue` prefix | Strip prefix |
| **R11** | Page range uses **en-dash** (–) not hyphen (-) or other dash variants | Replace dash with en-dash |
| **R12** | DOI in URL form: `https://doi.org/10.xxxx/...` | Strip `doi:`; prepend `https://doi.org/` |
| **R13** | ISBN is 10 or 13 digits (ISBN-10 may end in `X`) | Strip hyphens / spaces |
| **R14** | Publisher has no leading `City:` location | Strip `City, ST:` prefix |
| **R15** | Edition is `2nd ed.` style, not `Second Edition` | Numeric → ordinal + `ed.` |
| **R17** | Required fields present per item type (journalArticle needs title, publicationTitle, volume, issue, pages, date; book needs title, date, publisher; etc.) | Flag; auto-fill via DOI/ISBN lookup |
| **R18** | Author is stored as a single field (`fieldMode=1`) — Word/Google Docs citations render `D. A. Titone` instead of `Titone` until the surname and given name are split into separate fields | Re-split via `Zotero.Utilities.cleanAuthor`; rewrite as `fieldMode=0` |
| **R19** | Stray HTML tags (`<scp>`, `<i>`), HTML entities (`&amp;`, `&nbsp;`), or weird whitespace runs (multi-space, NBSP, zero-width chars) in title / journal / publisher / creator names | Strip tags, decode entities, collapse whitespace |
| **R20** | Family name in ALL-CAPS (`SPRENGER` → `Sprenger`, `VON GOETHE` → `Von Goethe`) | Sentence-case with particles preserved |

You can enable / disable individual rule ids via the *Enabled rule
ids* textbox in the preferences pane. Default:
`R1,R4,R5,R6,R7,R8,R9,R11,R12,R13,R14,R15,R17,R18,R19,R20`.

### R18 — repair single-field authors

When Zotero Connector saves an item via the "Add by Identifier" flow,
some authors end up stored as `fieldMode=1` with the whole
`"Surname, Given"` string crammed into `lastName` and `firstName=""`.
Word's citation engine can't tell which is the surname, so it renders
the whole string as "first last" — `(D. A. Titone & Connine, 1999)`
instead of `(Titone & Connine, 1999)`.

Zometaker fixes this:

- **Automatic** — every "Update & normalise" command runs R18
  repair as part of the creators pass
- **One-click library scan** — Tools → **Repair single-field
  authors** (no metadata fetch, no network, just author cleanup)
- Splits via `Zotero.Utilities.cleanAuthor` (the same splitter every
  Zotero translator uses), then normalises each part per APA 7

| Before (`fieldMode=1`) | After (`fieldMode=0`) |
| --- | --- |
| `lastName="Titone, D. A."`, `firstName=""` | `lastName="Titone"`, `firstName="D. A."` |
| `lastName="Connine, C. M."`, `firstName=""` | `lastName="Connine"`, `firstName="C. M."` |

### Capitalisation examples

| Input | Output | Rule |
| --- | --- | --- |
| `JOHN SMITH` (initials mode) | `Smith, J.` | R1 + R4 |
| `JOHN SMITH` (titlecase mode) | `John Smith` | R1 |
| `SMITH, JOHN MICHAEL` | `Smith, J. M.` | R1 |
| `JEAN-PAUL SARTRE` | `Sartre, J.-P.` | R1 |
| `JOHN VON SMITH` | `von Smith, J.` | R1 |
| `VON GOETHE` | `Von Goethe` | R1 |
| `张三` | `张三` | R1 (CJK passthrough) |
| `NATURE` | `Nature` | R7 |
| `IEEE TRANSACTIONS ON PATTERN ANALYSIS` | `IEEE Transactions on Pattern Analysis` | R7 (acronym preserved) |
| `DEEP LEARNING FOR NLP` | `Deep learning for NLP` | R6 (sentence case) |
| `Memory &amp; Cognition` | `Memory & Cognition` | R7 + R19 |
| `vol. 12` | `12` | R8 |
| `no. 3` | `3` | R9 |
| `123-456` | `123–456` | R11 |
| `doi:10.1038/nature12373` | `https://doi.org/10.1038/nature12373` | R12 |
| `New York, NY: Routledge` | `Routledge` | R14 |
| `Second Edition` | `2nd ed.` | R15 |
| `ERMAN` (given name, all-caps) | `E.` | R4 |
| `SPRENGER` (family name, all-caps) | `Sprenger` | R20 |
| `VON GOETHE` (family name, all-caps) | `Von Goethe` | R20 (particle preserved) |
| `Putting a Lexical                 Approach to the test` | `Putting a Lexical Approach to the test` | R19 |
| `Learning L2 <scp>Foo</scp> bar` | `Learning L2 Foo bar` | R19 |

All normalisations are idempotent — running twice gives the same result.

---

## Architecture

```
content/
  name-normalizer.js      Author-name case + APA-7 initials
  journal-normalizer.js   Field-by-field normalisers
                          (title case, sentence case, DOI, ISBN,
                           pages, publisher, edition)
  apa-checker.js          Rule engine: each rule is an individually
                          toggleable function
  metadata-fetcher.js     CrossRef / OpenAlex / DataCite adapters
  zometaker.js            Orchestrator (per-item pipeline + UI)
chrome/
  content/preferences.xhtml
  content/preferences-bindings.js
  skin/default/zometaker/icon.svg
defaults/preferences/defaults.js   Default preferences
locale/en-US/zometaker.properties   UI strings
locale/en-US/zometaker.ftl          Fluent localisation for menus
tests/                       Unit tests (run with Node, no Zotero needed)
```

The per-item pipeline (`processItem` in `zometaker.js`):

```
fetch DOI/ISBN  →  fill empty fields  →  APA 7 rule check + fix
              →  normalise existing values  →  overwrite disagreements
              →  saveTx
```

---

## Companion tools

- **[citationHop](https://github.com/ShiyangZheng/citation-hop)** —
  macOS menu-bar app, ⌘⇧L hotkey, jumps from a Zotero item to its
  publisher page. This is the missing half of the reading-citing loop.
- **[Zotero Connector](https://www.zotero.org/download/connector)** —
  browser extension (Chrome / Firefox / Safari / Edge). Installs by
  default with Zotero; no setup needed. Pulls papers from publisher
  pages back into Zotero.

---

## Development

The normalisers, the APA checker and the fetcher are pure JS modules.
You can run the tests without a Zotero instance:

```bash
cd zometaker
node tests/name-normalizer.test.js
node tests/field-normalizer.test.js
node tests/metadata-fetcher.test.js   # requires network
```

---

## Privacy / network

This plugin only talks to:

- `api.crossref.org`
- `api.openalex.org`
- `api.datacite.org`
- `openlibrary.org`

It sends no analytics. The `User-Agent` header includes the contact
e-mail you set in preferences (recommended by CrossRef etiquette).

---

## License

MIT. See top-of-file headers in each source file.

---

## Credits

Originally developed as **Metadata Caretaker**.
Renamed to **Zometaker** in v1.0.0 to clarify that it's specifically
targeted at cleaning up Zotero Connector imports.