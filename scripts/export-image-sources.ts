// Export every bio's image credit ("Source:" line) to a CSV, flagging whether
// the source link is a 404.
//
// Columns: entry, full text, link, status.
//   - "full text" is the credit exactly as the site parses it: we call the same
//     `parseImage` the content loader uses (docxLoader → extractAll → parseImage),
//     so the CSV can't drift from what an entry page shows. Run direct on the
//     DOCX — no `astro build` needed (skips the TensorFlow portrait crop etc.).
//   - "link" is the primary (first) URL, via the same `parseImageSource` the
//     entry-page credit links — so the audited link == the on-site link.
//   - "status": "OK" (reachable, non-404), "404", "no link" (credit has no URL),
//     or "ERROR" (dead-but-not-404: timeout/DNS/5xx — never mislabeled "OK").
//
// Caveats: some hosts block HEAD/bots and may surface "ERROR" though the link is
// live (the desktop UA + GET fallback reduce, but can't eliminate, this) — so
// "ERROR" is "couldn't confirm", not "confirmed dead". Bare `www.` credits are
// checked as `https://…` (matching the on-site link).
//
// Run:  npm run images:sources

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { basename } from "node:path";
import pLimit from "p-limit";
import { OfficeParser } from "officeparser";
import { parseImage } from "../src/content/loaders/parsers/parseImage.ts";
import { parseImageSource } from "../src/utils/imageSource.ts";

const BIOS_DIR = path.resolve("./src/content/bios-processed");
const OUT_DIR = path.resolve("./bios-deliverables");
const OUT_FILE = path.join(OUT_DIR, "image-sources.csv");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TIMEOUT_MS = 10_000;

type Status = "OK" | "404" | "ERROR" | "no link";

interface Row {
  entry: string;
  fullText: string;
  link: string;
  status: Status;
}

/** Classify an HTTP response into our minimal status vocabulary. */
function classify(res: Response): Status | null {
  if (res.status === 404) return "404";
  if (res.ok || (res.status >= 200 && res.status < 400)) return "OK";
  return null; // inconclusive — caller may retry with GET
}

async function checkLink(href: string): Promise<Status> {
  // officeparser already decodes XML entities, but decode &amp; defensively.
  const url = href.replace(/&amp;/g, "&");

  const hit = (method: "HEAD" | "GET") =>
    fetch(url, {
      method,
      redirect: "follow",
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  try {
    const head = await hit("HEAD");
    const headVerdict = classify(head);
    if (headVerdict === "404") return "404";
    if (headVerdict === "OK") return "OK";
    // HEAD blocked/odd (403/405/501/5xx) — many servers only answer GET.
    const get = await hit("GET");
    return classify(get) ?? "ERROR";
  } catch {
    // Network error / timeout on HEAD — give GET one chance before giving up.
    try {
      const get = await hit("GET");
      return classify(get) ?? "ERROR";
    } catch {
      return "ERROR";
    }
  }
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

async function main() {
  if (!existsSync(BIOS_DIR)) {
    console.error(`[images] bios dir not found: ${BIOS_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(BIOS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".docx") && !f.startsWith("~$"))
    .sort();

  console.log(`[images] ${files.length} entries → checking links…`);

  const limit = pLimit(8);
  const rows: Row[] = await Promise.all(
    files.map((file) =>
      limit(async (): Promise<Row> => {
        const entry = basename(file, path.extname(file));
        let fullText = "";
        try {
          const ast = await OfficeParser.parseOffice(
            path.join(BIOS_DIR, file),
            { extractAttachments: false },
          );
          fullText = parseImage(ast).value.imageSource ?? "";
        } catch (err) {
          console.warn(
            `[images] ${entry}: parse failed — ${(err as Error).message}`,
          );
        }

        const { href } = parseImageSource(fullText);
        const status: Status = href ? await checkLink(href) : "no link";
        return { entry, fullText, link: href ?? "", status };
      }),
    ),
  );

  rows.sort((a, b) => a.entry.localeCompare(b.entry));

  const header = ["entry", "full text", "link", "status"].map(csvCell).join(",");
  const body = rows
    .map((r) =>
      [r.entry, r.fullText, r.link, r.status].map(csvCell).join(","),
    )
    .join("\r\n");
  // UTF-8 BOM so Excel renders accented credits correctly.
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, "﻿" + header + "\r\n" + body + "\r\n", "utf8");

  const tally = (s: Status) => rows.filter((r) => r.status === s).length;
  console.log(
    `[images] wrote ${rows.length} rows → ${path.relative(process.cwd(), OUT_FILE)}\n` +
      `         OK: ${tally("OK")}  404: ${tally("404")}  ` +
      `ERROR: ${tally("ERROR")}  no link: ${tally("no link")}`,
  );
}

await main();
