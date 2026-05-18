import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
async function dh(f){ const {data}=await sharp(f).resize(9,8,{fit:'fill'}).grayscale().raw().toBuffer({resolveWithObject:true}); let h=0n; for(let r=0;r<8;r++)for(let c=0;c<8;c++)h=(h<<1n)|(data[r*9+c]>data[r*9+c+1]?1n:0n); return h; }
function ham(a,b){let x=a^b,n=0;while(x){n+=Number(x&1n);x>>=1n;}return n;}

const dir = '/tmp/img-fetch/fetched';
for (const f of fs.readdirSync(dir).sort()) {
  if (f.endsWith('-ru.jpg')) continue;  // dup
  const slug = f.replace(/\.(jpg|jpeg|png|webp)$/, '');
  const docFile = fs.readdirSync('src/assets/bios').find(g => g.startsWith(slug + "-docx-image1."));
  if (!docFile) { console.log(`${slug}: NO ORIG`); continue; }
  try {
    const orig = await sharp('src/assets/bios/'+docFile).metadata();
    const cand = await sharp(path.join(dir, f)).metadata();
    const d = ham(await dh('src/assets/bios/'+docFile), await dh(path.join(dir, f)));
    const verdict = d <= 16 ? 'SAVE' : 'SKIP';
    console.log(`  ${slug.padEnd(36)}  ${orig.width}x${orig.height} -> ${cand.width}x${cand.height}  d=${d}  ${verdict}`);
    if (d <= 16) {
      const outExt = f.match(/\.(jpg|jpeg|png|webp)$/)[1] === 'jpeg' ? 'jpg' : f.match(/\.(jpg|jpeg|png|webp)$/)[1];
      fs.copyFileSync(path.join(dir, f), `src/content/bios-images/${slug}.${outExt}`);
    }
  } catch (e) { console.log(`${slug}: ${e.message}`); }
}
