import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
async function dh(f){const{data}=await sharp(f).resize(9,8,{fit:'fill'}).grayscale().raw().toBuffer({resolveWithObject:true});let h=0n;for(let r=0;r<8;r++)for(let c=0;c<8;c++)h=(h<<1n)|(data[r*9+c]>data[r*9+c+1]?1n:0n);return h}
function ham(a,b){let x=a^b,n=0;while(x){n+=Number(x&1n);x>>=1n}return n}
const od='src/content/bios-images', bd='src/assets/bios';
const rows=[];
for(const f of fs.readdirSync(od).sort()){
  if(!/\.(jpg|jpeg|png|webp)$/.test(f)||f.startsWith('README'))continue;
  const slug=f.replace(/\.[^.]+$/,'');
  const doc=fs.readdirSync(bd).find(g=>g.startsWith(slug+'-docx-image1.'));
  if(!doc)continue;
  const orig=await sharp(path.join(bd,doc)).metadata();
  const cand=await sharp(path.join(od,f)).metadata();
  const d=ham(await dh(path.join(bd,doc)),await dh(path.join(od,f)));
  const om=Math.min(orig.width,orig.height),cm=Math.min(cand.width,cand.height);
  rows.push({slug,before:`${orig.width}x${orig.height}`,after:`${cand.width}x${cand.height}`,factor:+(cm/om).toFixed(2),d});
}
rows.sort((a,b)=>b.factor-a.factor);
console.log(`\n${rows.length} overrides:\n`);
console.log('slug                              before     →  after        factor  hash-dist');
for(const r of rows) console.log(`  ${r.slug.padEnd(32)}  ${r.before.padEnd(10)}→  ${r.after.padEnd(12)} ${r.factor}× d=${r.d}`);
console.log(`\nMean upgrade factor: ${(rows.reduce((a,b)=>a+b.factor,0)/rows.length).toFixed(2)}×`);
