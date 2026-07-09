/**
 * Face-detection-based portrait cropper.
 *
 * Reads an image, trims any near-uniform background border, detects faces
 * with @vladmandic/face-api's TinyFaceDetector, and writes a fixed-aspect-
 * ratio portrait at a fixed pixel size where the face is positioned at the
 * upper third of the frame.
 *
 * If no face is detected, falls back to sharp's `attention` saliency crop
 * (libvips's built-in entropy-based selector).
 *
 * The TF-node native binding is loaded lazily on first call.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const TARGET_W = 800;
const TARGET_H = 1000;
const TARGET_RATIO = TARGET_W / TARGET_H; // 0.8

/**
 * The face-api detector returns a tight box around eyes/nose/mouth and
 * doesn't include hair, forehead, ears, or jaw extension. Treat the actual
 * "head" as the face box plus padding on every side.
 */
/** Padding above the face-detector box (fraction of face.height) for hair/forehead. */
const HAIR_PADDING = 0.4;
/** Padding to each side of the face-detector box (fraction of face.width) for hair/ears. */
const HORIZONTAL_PADDING = 0.25;
/** Padding below the face-detector box (fraction of face.height) for chin/neck. */
const CHIN_PADDING = 0.2;
/** Padded head should occupy this fraction of the output width. */
const HEAD_FRACTION = 0.7;
/** Where the top of the head should land in the output, as a fraction of output height. */
const HEAD_TOP_RATIO = 0.08;
/** Trim threshold for near-uniform background (white book scans, etc.). */
const TRIM_THRESHOLD = 12;

let faceapi: typeof import("@vladmandic/face-api") | null = null;
let modelsLoaded = false;
const MODEL_PATH = "node_modules/@vladmandic/face-api/model";

async function ensureFaceApi() {
  if (modelsLoaded && faceapi) return faceapi;
  // Use the WASM build (no native tfjs-node dependency — works on Node 24
  // and on Linux GH runners without node-gyp builds).
  faceapi = (await import(
    "@vladmandic/face-api/dist/face-api.node-wasm.js"
  )) as any;
  await (faceapi as any).tf.setWasmPaths(
    "node_modules/@tensorflow/tfjs-backend-wasm/dist/",
  );
  await (faceapi as any).tf.setBackend("wasm");
  await (faceapi as any).tf.ready();
  await faceapi!.nets.tinyFaceDetector.loadFromDisk(MODEL_PATH);
  modelsLoaded = true;
  return faceapi!;
}

function computeCropForFace(
  face: { x: number; y: number; width: number; height: number },
  srcW: number,
  srcH: number,
) {
  // Expand the detector box on every side to approximate the *head* (hair,
  // ears, forehead, chin). Use the padded head, not the face box, when
  // calculating both crop size and centring.
  const headLeft = face.x - face.width * HORIZONTAL_PADDING;
  const headRight = face.x + face.width + face.width * HORIZONTAL_PADDING;
  const headTop = face.y - face.height * HAIR_PADDING;
  const headBottom = face.y + face.height + face.height * CHIN_PADDING;
  const headWidth = headRight - headLeft;
  const headCenterX = (headLeft + headRight) / 2;

  // Crop sized so the padded head occupies HEAD_FRACTION of the output width.
  let cropW = headWidth / HEAD_FRACTION;
  let cropH = cropW / TARGET_RATIO;

  // Cap to source. When height is the limit, the resulting cropW shrinks so
  // the head occupies a larger fraction of the output — acceptable trade-off;
  // the alternative would be to violate the target aspect ratio.
  if (cropW > srcW) {
    cropW = srcW;
    cropH = cropW / TARGET_RATIO;
  }
  if (cropH > srcH) {
    cropH = srcH;
    cropW = cropH * TARGET_RATIO;
  }
  cropW = Math.floor(cropW);
  cropH = Math.floor(cropH);

  // Horizontal: centre on the padded-head centre. Vertical: anchor the head
  // top at HEAD_TOP_RATIO of output height so hair always has breathing room.
  let left = Math.round(headCenterX - cropW / 2);
  let top = Math.round(headTop - cropH * HEAD_TOP_RATIO);

  left = Math.max(0, Math.min(srcW - cropW, left));
  top = Math.max(0, Math.min(srcH - cropH, top));

  return { left, top, width: cropW, height: cropH };
}

/**
 * Choose the subject's face among the detected boxes.
 *
 * Default: the largest box — in almost every photo the subject dominates the
 * frame, so this is the most reliable single signal.
 *
 * Override: `subjectIndex` (1-based, counting the detected faces left-to-right
 * by their centre) forces a specific face for the rare multi-person photo where
 * the subject isn't the largest — e.g. a two-person shot where a companion's
 * face reads bigger. Set per entry in src/data/portrait-subjects.json. An
 * absent or out-of-range index falls back to the largest box, so entries
 * without an override are unaffected.
 */
function selectSubjectFace<T extends { x: number; y: number; width: number; height: number }>(
  boxes: T[],
  subjectIndex?: number,
): T {
  if (subjectIndex && Number.isInteger(subjectIndex) && subjectIndex >= 1) {
    const leftToRight = [...boxes].sort(
      (a, b) => a.x + a.width / 2 - (b.x + b.width / 2),
    );
    const chosen = leftToRight[subjectIndex - 1];
    if (chosen) return chosen; // out-of-range → fall through to largest
  }
  const area = (b: T) => b.width * b.height;
  return boxes.reduce((big, b) => (area(b) > area(big) ? b : big));
}

/**
 * Crop `inputPath` to a face-centred portrait and write to `outputPath`.
 *
 * Always produces TARGET_W × TARGET_H JPEG. Returns `true` if a face was
 * detected and used; `false` if the fallback saliency crop was used.
 *
 * `subjectIndex` (1-based, counting detected faces left-to-right) overrides
 * which face is used for multi-person photos where the largest isn't the
 * subject; see selectSubjectFace and src/data/portrait-subjects.json.
 */
export async function cropToPortrait(
  inputPath: string,
  outputPath: string,
  subjectIndex?: number,
): Promise<{ usedFace: boolean }> {
  if (!existsSync(inputPath)) {
    throw new Error(`Input image does not exist: ${inputPath}`);
  }

  // 1) Trim a near-uniform background (helps EMF→PNG outputs with white pads).
  const trimmed = await sharp(inputPath)
    .trim({ background: "white", threshold: TRIM_THRESHOLD })
    .toBuffer({ resolveWithObject: true })
    .catch(async () => {
      // .trim can fail on RGBA pngs; fall back to no trim.
      return await sharp(inputPath).toBuffer({ resolveWithObject: true });
    });
  const trimmedBuf = trimmed.data;
  const { width: srcW, height: srcH } = trimmed.info;

  // 2) Decode to a 3-channel raw buffer for face detection. Downscale to a
  //    bounded max side first — the WASM backend allocates a working buffer
  //    proportional to the input tensor, and 4×-upscaled portraits (4000×5000+)
  //    blow past 1.5 GB. TinyFaceDetector resizes to 416 internally anyway,
  //    so detail beyond ~1200px is wasted.
  const fapi = await ensureFaceApi();
  const FACE_DETECT_MAX_SIDE = 1200;
  const scale = Math.min(1, FACE_DETECT_MAX_SIDE / Math.max(srcW, srcH));
  const detectW = Math.round(srcW * scale);
  const detectH = Math.round(srcH * scale);
  const rgbBuf =
    scale < 1
      ? await sharp(trimmedBuf)
          .resize(detectW, detectH, { fit: "fill" })
          .removeAlpha()
          .raw()
          .toBuffer()
      : await sharp(trimmedBuf).removeAlpha().raw().toBuffer();
  const tensor = (fapi as any).tf.tensor3d(
    new Uint8Array(rgbBuf),
    [detectH, detectW, 3],
    "int32",
  );
  const detections = await fapi.detectAllFaces(
    tensor as any,
    new fapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }),
  );
  tensor.dispose();

  if (detections.length > 0) {
    // Pick the subject's face — the largest box, unless a per-entry
    // subjectIndex overrides it (see selectSubjectFace). Boxes are in the
    // downscaled detection-tensor space; the uniform downscale preserves their
    // left-to-right order, so we select here then scale back to source.
    const faceScaled = selectSubjectFace(
      detections.map((d) => d.box),
      subjectIndex,
    );
    // Coordinates came from the downscaled tensor; scale back to source pixels.
    const face = {
      x: faceScaled.x / scale,
      y: faceScaled.y / scale,
      width: faceScaled.width / scale,
      height: faceScaled.height / scale,
    };
    const crop = computeCropForFace(face, srcW, srcH);
    // Never enlarge: if the cropped head-region is smaller than TARGET_W×
    // TARGET_H, emit at native size. Astro's responsive `<Image>` downscales
    // per breakpoint, but resizing the cropped region UP here would force a
    // second upscale on top of whatever the source override already did
    // (visibly soft for entries whose docx source was <300px).
    const outputW = Math.min(TARGET_W, crop.width);
    const outputH = Math.round(outputW / TARGET_RATIO);
    await sharp(trimmedBuf)
      .extract(crop)
      .resize(outputW, outputH, { fit: "cover", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toFile(outputPath);
    return { usedFace: true };
  }

  // Fallback: sharp's attention strategy. Don't enlarge either.
  const fbOutputW = Math.min(TARGET_W, srcW);
  const fbOutputH = Math.round(fbOutputW / TARGET_RATIO);
  await sharp(trimmedBuf)
    .resize(fbOutputW, fbOutputH, {
      fit: "cover",
      position: sharp.strategy.attention,
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toFile(outputPath);
  return { usedFace: false };
}
