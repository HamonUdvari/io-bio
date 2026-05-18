import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const RIS_DIR = "/tmp/img-fetch/ris";
const THUMB_DIR = "/tmp/img-fetch/thumbs3";
const ORIGINAL_DIR = "src/assets/bios";
const OVERRIDE_DIR = "src/content/bios-images";
fs.mkdirSync(THUMB_DIR, { recursive: true });

async function dhash(file) {
  try {
    const { data } = await sharp(file).resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
    let h = 0n;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) h = (h << 1n) | (data[r*9+c] > data[r*9+c+1] ? 1n : 0n);
    return h;
  } catch { return null; }
}
function hamming(a, b) { let x = a ^ b, n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; }
async function fetchUrl(url, out) {
  if (fs.existsSync(out) && fs.statSync(out).size > 1000) return true;
  const child = await import("node:child_process");
  try { child.execSync(`curl -sLA "Mozilla/5.0" --max-time 12 ${JSON.stringify(url)} -o ${JSON.stringify(out)}`, { stdio: "pipe", timeout: 18000 }); return fs.existsSync(out) && fs.statSync(out).size > 1000; } catch { return false; }
}

const haveOverride = new Set(fs.readdirSync(OVERRIDE_DIR).filter(f => !f.startsWith('README') && !f.startsWith('.')).map(f => f.replace(/\.[^.]+$/, '')));
const slugs = fs.readdirSync(RIS_DIR).map(f => f.replace(/\.json$/, '')).filter(s => !haveOverride.has(s) && !s.endsWith('-modified'));
console.error(`Processing ${slugs.length} slugs`);

const results = [];
let idx = 0;
for (const slug of slugs) {
  idx++;
  const docFile = fs.readdirSync(ORIGINAL_DIR).find(g => g.startsWith(slug + "-docx-image1."));
  if (!docFile) continue;
  const origHash = await dhash(path.join(ORIGINAL_DIR, docFile));
  if (origHash === null) continue;
  const origMeta = await sharp(path.join(ORIGINAL_DIR, docFile)).metadata();
  const origMin = Math.min(origMeta.width, origMeta.height);

  let ris;
  try { ris = JSON.parse(fs.readFileSync(path.join(RIS_DIR, slug + ".json"), "utf8")); } catch { continue; }

  // ALL candidates with thumbnails (don't require size)
  const cands = [];
  for (const [eng, info] of Object.entries(ris.engines || {})) {
    for (const r of info.results || []) {
      if (!r.thumbnail) continue;
      let w = 0, h = 0;
      if (r.size && r.size.includes('x')) { [w, h] = r.size.split('x').map(Number); }
      cands.push({ engine: eng, url: r.url, thumb: r.thumbnail, w, h, m: Math.min(w||0,h||0), source: r.source });
    }
  }
  // Hash all candidates, take closest 5
  const matched = [];
  for (let i = 0; i < Math.min(cands.length, 15); i++) {
    const c = cands[i];
    const ext = (c.thumb.match(/\.(jpg|jpeg|png|webp|gif)([?&]|$)/i) || [])[1] || "jpg";
    const thumbFile = path.join(THUMB_DIR, `${slug}__${i}.${ext}`);
    const ok = await fetchUrl(c.thumb, thumbFile);
    if (!ok) continue;
    const h = await dhash(thumbFile);
    if (h === null) continue;
    const d = hamming(origHash, h);
    matched.push({ ...c, dist: d, thumbIdx: i });
  }
  matched.sort((a, b) => a.dist - b.dist);
  // Report any candidate with dist<=15 AND known size>origMin
  const usable = matched.filter(m => m.dist <= 15 && m.m > origMin);
  // Or with dist<=10 even without size info
  const promising = matched.filter(m => m.dist <= 12);
  
  const best = usable[0] || null;
  results.push({ slug, origMin, best, top5: matched.slice(0, 5), promising: promising.slice(0, 3) });
  process.stderr.write(`[${idx}/${slugs.length}] ${slug}: best ${best ? `${best.m}px d=${best.dist}` : "none"}; promising ${promising.length}\n`);
}

console.log(JSON.stringify(results, null, 2));
