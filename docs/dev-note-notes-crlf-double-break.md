# Dev note: Notes gain a blank line between sentences after load

**Date:** 2026-10-19  
**Symptom:** On open, notes showed 2–3 gaps between sentences. The text looked wider than what was typed and saved. It read as extra spaces. It was an extra line break.

## Root cause

Saved note content contained Windows CRLF (`\r\n`).

`mdToEditHtml` replaced only `\n` with `<br>` and left the `\r` in the HTML string. The HTML parser turns a carriage return into a line feed in the text node. The editor uses `white-space: pre-wrap`, so that leftover break paints as well as the `<br>`. One stored line break became two on screen. The next read-back (`editHtmlToMd`) saved the doubled `\n`s and dropped the `\r`.

Runtime evidence (session `b8a8d6`):

1. Before the fix, note 2 loaded with 13 carriage returns. Gaps after punctuation went from `rn` / `nnnrn` to `nn` / `nnnnn`. Length stayed 1663. Each `\r` had become another `\n`. A one-second delay did not change the text, so it was not spellcheck.
2. After the fix, note 34 loaded with `srcCr: 5`, `srcNl: 11`, `roundNl: 11`, `roundCr: 0`. Note 31 loaded with `srcCr: 21`, `srcNl: 24`, `roundNl: 24`. Carriage returns no longer added breaks.

Single spaces after periods stayed single spaces on the note that was traced. Some older notes also have literal double spaces stored after periods. That is separate. This bug did not insert those.

## Fix

`normalizeNewlines` in both markdown copies converts `\r\n` and a lone `\r` to `\n` before any `<br>` conversion or preview split, and again when the editor is serialized:

- [`src/utils/basic-md.js`](../src/utils/basic-md.js) — `mdToEditHtml`, `renderBasicMd`, `editHtmlToMd`
- [`src/utils/basic-md.cjs`](../src/utils/basic-md.cjs) — `renderBasicMd` (print / export)

Order matters. Collapse `\r\n` to `\n` first, then turn a remaining `\r` into `\n`. Replacing `\n` with `<br>` while `\r` is still in the string is the bug.

## If it reoccurs

1. Check the saved `notes.content` for `\r`. Count of `\r` greater than 0 plus a visual blank line per sentence is this bug.
2. Keep `normalizeNewlines` on the path into `mdToEditHtml` **before** `.replace(/\n/g, '<br>')`. Do not drop that call to “simplify” the HTML builder.
3. Do not “fix” it by collapsing every `\n\n` or every double space. Blank lines and two spaces after a period can be intentional. Only the carriage return was doubled.
4. The CommonJS copy is what print/export uses. A fix in `basic-md.js` alone leaves print on the old path.
