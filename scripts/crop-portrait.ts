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
 * Crop `inputPath` to a face-centred portrait and write to `outputPath`.
 *
 * Always produces TARGET_W × TARGET_H JPEG. Returns `true` if a face was
 * detected and used; `false` if the fallback saliency crop was used.
 */
export async function cropToPortrait(
  inputPath: string,
  outputPath: string,
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

  // 2) Decode to a 3-channel raw buffer for face detection.
  const fapi = await ensureFaceApi();
  const rgbBuf = await sharp(trimmedBuf).removeAlpha().raw().toBuffer();
  const tensor = (fapi as any).tf.tensor3d(
    new Uint8Array(rgbBuf),
    [srcH, srcW, 3],
    "int32",
  );
  const detections = await fapi.detectAllFaces(
    tensor as any,
    new fapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }),
  );
  tensor.dispose();

  if (detections.length > 0) {
    // Largest detected face — most likely the subject.
    const face = detections
      .map((d) => d.box)
      .reduce((biggest, b) =>
        b.width * b.height > biggest.width * biggest.height ? b : biggest,
      );
    const crop = computeCropForFace(face, srcW, srcH);
    await sharp(trimmedBuf)
      .extract(crop)
      .resize(TARGET_W, TARGET_H, { fit: "cover" })
      .jpeg({ quality: 88 })
      .toFile(outputPath);
    return { usedFace: true };
  }

  // Fallback: sharp's attention strategy.
  await sharp(trimmedBuf)
    .resize(TARGET_W, TARGET_H, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 88 })
    .toFile(outputPath);
  return { usedFace: false };
}
