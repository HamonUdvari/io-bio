// For each entry's RIS results, fetch every candidate's thumbnail, compute a
// perceptual hash, and compare against the docx-embedded original. Output the
// best candidate that is BOTH (a) the same image (small hash distance) and
// (b) larger than the current source.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const RIS_DIR = "/tmp/img-fetch/ris";
const THUMB_DIR = "/tmp/img-fetch/thumbs";
const ORIGINAL_DIR = "src/assets/bios";
fs.mkdirSync(THUMB_DIR, { recursive: true });

async function dhash(file) {
  try {
    const { data } = await sharp(file)
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let h = 0n;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        h = (h << 1n) | (data[r * 9 + c] > data[r * 9 + c + 1] ? 1n : 0n);
      }
    }
    return h;
  } catch {
    return null;
  }
}
function hamming(a, b) {
  let x = a ^ b, n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

async function fetchUrl(url, out) {
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) return true;
  const child = await import("node:child_process");
  try {
    child.execSync(
      `curl -sLA "Mozilla/5.0 (Macintosh)" --max-time 15 ${JSON.stringify(url)} -o ${JSON.stringify(out)}`,
      { stdio: "pipe", timeout: 20000 },
    );
    return fs.existsSync(out) && fs.statSync(out).size > 1000;
  } catch {
    return false;
  }
}

const slugs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(RIS_DIR).map((f) => f.replace(/\.json$/, ""));

const results = [];
let idx = 0;
for (const slug of slugs) {
  idx++;
  const docFile = fs
    .readdirSync(ORIGINAL_DIR)
    .find((g) => g.startsWith(slug + "-docx-image1."));
  if (!docFile) continue;
  const origHash = await dhash(path.join(ORIGINAL_DIR, docFile));
  if (origHash === null) continue;
  const origMeta = await sharp(path.join(ORIGINAL_DIR, docFile)).metadata();
  const origMin = Math.min(origMeta.width, origMeta.height);

  let risPath = path.join(RIS_DIR, slug + ".json");
  if (!fs.existsSync(risPath)) continue;
  let ris;
  try { ris = JSON.parse(fs.readFileSync(risPath, "utf8")); } catch { continue; }

  const cands = [];
  for (const [eng, info] of Object.entries(ris.engines || {})) {
    for (const r of info.results || []) {
      if (!r.thumbnail || !r.size || !r.size.includes("x")) continue;
      const [w, h] = r.size.split("x").map(Number);
      if (!w || !h) continue;
      const m = Math.min(w, h);
      if (m <= origMin) continue; // we only care if it's larger
      cands.push({ engine: eng, url: r.url, thumb: r.thumbnail, w, h, m, source: r.source });
    }
  }
  // Top 8 by size
  cands.sort((a, b) => b.m - a.m);
  const top = cands.slice(0, 8);

  const matched = [];
  for (let i = 0; i < top.length; i++) {
    const c = top[i];
    const ext = (c.thumb.match(/\.(jpg|jpeg|png|webp|gif)([?&]|$)/i) || [])[1] || "jpg";
    const thumbFile = path.join(THUMB_DIR, `${slug}__${i}.${ext}`);
    const ok = await fetchUrl(c.thumb, thumbFile);
    if (!ok) continue;
    const h = await dhash(thumbFile);
    if (h === null) continue;
    const d = hamming(origHash, h);
    matched.push({ ...c, dist: d });
  }
  matched.sort((a, b) => a.dist - b.dist);
  const best = matched[0];
  results.push({ slug, origMin, best, allCandidates: matched.slice(0, 3) });
  process.stderr.write(`[${idx}/${slugs.length}] ${slug}: best ${best ? `${best.m}px d=${best.dist}` : "none"}\n`);
}

console.log(JSON.stringify(results, null, 2));
