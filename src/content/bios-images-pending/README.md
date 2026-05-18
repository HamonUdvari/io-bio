# Pending image overrides — manual fetch

Candidates the automated pipeline found but couldn't download (bot protection, JS-rendered pages, dead links, etc.). To use:

1. Open `manual-fetch.csv` — each row is one candidate.
2. Visit `page_url` in a browser, locate the portrait, save it as the file in `target_filename`.
3. Drop the saved file into **`src/content/bios-images/`** (not this folder).
4. Re-run `npm run bios:process && npm run build`. The override will be picked up automatically.

## Columns

- **slug** — bio entry slug
- **target_filename** — exactly this name in `src/content/bios-images/` (lowercase, hyphens, .jpg)
- **page_url** — where the candidate lives
- **source_host** — for triage
- **candidate_size** — the resolution Yandex reported
- **current_size** — current docx-embedded image's minimum side
- **upgrade_factor** — improvement if the manual fetch succeeds
- **hash_distance** — dHash distance between docx original and the Yandex thumbnail (0=identical, ≤16=likely same image, >16=likely different photo)
- **notes** — why automation failed + tips

## Verifying same-image after download

After saving a new override:

```bash
node -e "
const sharp = require('sharp'), fs = require('fs');
async function dh(f){const{data}=await sharp(f).resize(9,8,{fit:'fill'}).grayscale().raw().toBuffer({resolveWithObject:true});let h=0n;for(let r=0;r<8;r++)for(let c=0;c<8;c++)h=(h<<1n)|(data[r*9+c]>data[r*9+c+1]?1n:0n);return h}
function ham(a,b){let x=a^b,n=0;while(x){n+=Number(x&1n);x>>=1n}return n}
(async()=>{
  const slug='<SLUG>';
  const docF = fs.readdirSync('src/assets/bios').find(g=>g.startsWith(slug+'-docx-image1.'));
  const d = ham(await dh('src/assets/bios/'+docF), await dh('src/content/bios-images/'+slug+'.jpg'));
  console.log('hash distance:', d, d<=16?'✓ same image':'✗ different');
})();"
```

Anything with distance > 16 is probably a different photo of the same person — don't commit those (the project policy is to preserve the author's editorial choice of photo, only upgrading resolution).
