import type { Warning } from "./types";

/**
 * Repair web addresses that the Word text splits with one stray space
 * ("www.huffpost.com/ entry/…", "fullText?p _lang=en", "chisholm. html").
 *
 * Runs on the officeparser AST before any parser, so the lists, the body, the
 * html, the search index and /preview all show the same repaired text. Only
 * clear patterns are joined; an address that still looks split but matches no
 * rule is reported as "unclear" and left as written.
 *
 * Known limits (see the tests): a hyphenated word after a trailing slash is
 * joined ("…/ well-known", "…/ long-term"), because real cases need it
 * ("1990/ lecture-xxvii"); so is "…/ and/or"; "http:// www.x.org" is not
 * detected; tables are not scanned.
 */

// The address part of the word before the space: from its first scheme or
// "www." to the end of the word.
const URL_TOKEN_RE = /(?:https?:\/\/|www\.)\S*$/;

const HOST =
  "com|org|net|edu|gov|int|ac|co|uk|de|fr|ch|nl|be|se|dk|no|it|es|ca|au|br|info";
// A host label, then "/" or a further lower-case label ("ac.uk/…", "com/…"),
// so "www.x.org. ca. 1925" and "No. 5" stay apart.
const HOST_AT_START_RE = new RegExp(`^(?:${HOST})(?:/|\\.\\p{Ll})`, "u");
const DOT_HOST_AT_START_RE = new RegExp(`^\\.(?:${HOST})(?:/|\\.\\p{Ll})`, "u");
const FILE_ENDING_RE =
  /^(?:s?html?|pdf|aspx?|php|jsp|cfm|docx?|xml|jpe?g|png|gif)(?:[;,.)\]]|$)/;
const FILE_TAIL_RE =
  /\.(?:s?html?|pdf|aspx?|php|jsp|cfm|docx?|xml|jpe?g|png|gif)$/;
const TRAILING_PUNCT_RE = /[;,.)\]]+$/;
// Prose words that often follow an address; never worth an "unclear" warning.
const PROSE_AFTER_URL_RE =
  /^(?:accessed|retrieved|available|visited|consulted|viewed)$/i;

/** Words after an address that are never part of it. */
function neverJoin(next: string): boolean {
  return (
    /^(?:www\.|https?:)/i.test(next) ||
    !/[\p{L}\p{N}]/u.test(next) ||
    /^(?:\p{Lu}\.)+[;,)\]]*$/u.test(next) ||
    /^(?:e\.g|i\.e)\.?[;,)\]]*$/i.test(next) ||
    /^[([‘’“"'«]/.test(next)
  );
}

function shouldJoin(url: string, next: string): boolean {
  const core = next.replace(TRAILING_PUNCT_RE, "");
  if (/^[_/%]/.test(next)) return true;
  if (DOT_HOST_AT_START_RE.test(next)) return true;
  if (/[/_]$/.test(url)) {
    if (/[/_=&?#%]/.test(core)) return true;
    // "butler.htm" yes; "n.d.", "p.5", "12.03.2010" no.
    if (core.includes(".")) return FILE_TAIL_RE.test(core);
    // "lecture-xxvii" yes; "12-15", "1945-1960" no.
    if (core.includes("-")) return /\p{L}/u.test(core);
  }
  if (/[?&]$/.test(url) && core.includes("=")) return true;
  if (/=$/.test(url) && /^[\p{L}\p{N}]/u.test(next)) return true;
  if (/\.$/.test(url))
    return HOST_AT_START_RE.test(next) || FILE_ENDING_RE.test(next);
  return false;
}

function looksSplit(url: string, next: string): boolean {
  if (!/[/_?=&]$/.test(url)) return false;
  const core = next.replace(TRAILING_PUNCT_RE, "");
  if (PROSE_AFTER_URL_RE.test(core)) return false;
  return /\p{N}/u.test(core) || (core.match(/\p{L}/gu) ?? []).length >= 8;
}

export type UrlSplits = {
  /** Indices (in the input text) of the spaces to remove. */
  repair: number[];
  /** Indices of spaces that may split an address but match no rule. */
  unclear: number[];
};

/**
 * Find the stray spaces inside web addresses in one paragraph's text. One
 * left-to-right pass: the word before each space already includes the spaces
 * removed to its left, so an address split twice is repaired fully.
 */
export function findUrlSplits(text: string): UrlSplits {
  const repair: number[] = [];
  const unclear: number[] = [];
  const removed = new Set<number>();
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] !== " " || text[i - 1] === " " || text[i + 1] === " ") continue;
    // The word before the space, with the spaces already removed joined in.
    let start = i;
    while (start > 0 && (!/\s/.test(text[start - 1]) || removed.has(start - 1)))
      start--;
    let word = "";
    for (let k = start; k < i; k++) if (!removed.has(k)) word += text[k];
    const url = word.match(URL_TOKEN_RE)?.[0];
    if (!url || /^(?:https?:\/\/|www\.)$/.test(url)) continue;
    let end = i + 1;
    while (end < text.length && !/\s/.test(text[end])) end++;
    const next = text.slice(i + 1, end);
    if (neverJoin(next)) continue;
    if (shouldJoin(url, next)) {
      removed.add(i);
      repair.push(i);
    } else if (looksSplit(url, next)) unclear.push(i);
  }
  return { repair, unclear };
}

const SNIPPET = 30;
const snippet = (text: string, at: number) =>
  `…${text.slice(Math.max(0, at - SNIPPET), at)}␣${text.slice(at + 1, at + 1 + SNIPPET)}…`;

const REPAIRED_TYPES = new Set(["paragraph", "list", "heading"]);

/**
 * Apply findUrlSplits to every top-level paragraph, list and heading node.
 * Each removed space comes out of the node `text` and out of the text run
 * that holds it. Changed nodes are copies; the input is never mutated.
 */
export function repairUrlSpaces(content: any[]): {
  content: any[];
  warnings: Warning[];
} {
  const warnings: Warning[] = [];
  const out = content.map((node, index) => {
    if (!REPAIRED_TYPES.has(node?.type) || typeof node.text !== "string")
      return node;
    const { repair, unclear } = findUrlSplits(node.text);
    const field = `${node.type} ${index}`;
    for (const at of unclear)
      warnings.push({
        code: "url_space_unclear",
        field,
        message: `web address may be split by a space (left as written): "${snippet(node.text, at)}"`,
        severity: "warn",
      });
    if (repair.length === 0) return node;

    const children: any[] = node.children ?? [];
    const runs = children.filter((c) => c?.type === "text");
    if (runs.map((c) => c.text ?? "").join("") !== node.text) {
      for (const at of repair)
        warnings.push({
          code: "url_space_unclear",
          field,
          message: `web address split by a space, but the runs do not match the text (left as written): "${snippet(node.text, at)}"`,
          severity: "warn",
        });
      return node;
    }

    const drop = new Set(repair);
    let offset = 0;
    const newChildren = children.map((c) => {
      if (c?.type !== "text") return c;
      const t: string = c.text ?? "";
      const from = offset;
      offset += t.length;
      let kept = "";
      for (let k = 0; k < t.length; k++) if (!drop.has(from + k)) kept += t[k];
      return kept === t ? c : { ...c, text: kept };
    });
    let text = "";
    for (let k = 0; k < node.text.length; k++)
      if (!drop.has(k)) text += node.text[k];
    for (const at of repair)
      warnings.push({
        code: "url_space_repaired",
        field,
        message: `joined a web address split by a space: "${snippet(node.text, at)}"`,
        severity: "info",
      });
    return { ...node, text, children: newChildren };
  });
  return { content: out, warnings };
}
