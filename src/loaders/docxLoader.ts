import { existsSync, promises as fs, readFileSync } from "node:fs";
import { relative, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pLimit from "p-limit";
import colors from "piccolore";
import picomatch from "picomatch";
import { glob as tinyglobby } from "tinyglobby";
import type {
  ContentEntryRenderFunction,
  ContentEntryType,
} from "../../types/public/content.js";
import type { RenderedContent } from "../data-store.js";
import type { Loader } from "./types.js";
import { OfficeParser } from "officeparser";
import path from "node:path";
import { execSync } from "node:child_process";
import { slug as githubSlug } from "github-slugger";
import { extractAll } from "./parsers/extractAll";

const WEB_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg"]);

// --- Per-entry Zenodo DOIs (injected into entry data at build time) ---------
// Defaults to the PRODUCTION map; the sandbox map is read ONLY when a developer
// explicitly sets ZENODO_ENV=sandbox. CI sets no such var, so sandbox test DOIs
// (prefix 10.5072) can render in local dev but can never ship to the live site.
const DOI_ENV = process.env.ZENODO_ENV === "sandbox" ? "sandbox" : "production";
interface DoiEntry {
  versionDoi?: string;
  conceptDoi?: string;
  env?: string;
}
function loadDoiMap(): Record<string, DoiEntry> {
  const file =
    DOI_ENV === "sandbox" ? "zenodo-dois.sandbox.json" : "zenodo-dois.json";
  const p = path.resolve("./src/data", file);
  if (!existsSync(p)) return {};
  try {
    return (JSON.parse(readFileSync(p, "utf8")) as Record<string, DoiEntry>) ?? {};
  } catch {
    return {};
  }
}
const DOI_MAP = loadDoiMap();
const isSandboxDoi = (s?: string) => !!s && s.startsWith("10.5072/");

// The sandbox DOI map (committed temporarily for the client demo, issue #2) —
// read REGARDLESS of env so "How to cite" can PREVIEW the per-entry citation
// pointing at the sandbox deposit before production DOIs are minted. The
// production versionDoi/conceptDoi above always take precedence once they exist.
interface SandboxEntry {
  recordId?: number | string;
  conceptRecId?: number | string;
  versionDoi?: string;
  conceptDoi?: string;
}
function loadSandboxMap(): Record<string, SandboxEntry> {
  const p = path.resolve("./src/data", "zenodo-dois.sandbox.json");
  if (!existsSync(p)) return {};
  try {
    return (JSON.parse(readFileSync(p, "utf8")) as Record<string, SandboxEntry>) ?? {};
  } catch {
    return {};
  }
}
const SANDBOX_MAP = loadSandboxMap();

// --- Per-entry portrait face override (src/data/portrait-subjects.json) ------
// Maps an entry slug to the subject's 1-based position (faces counted
// left-to-right) so the portrait cropper picks the right person in multi-person
// photos where the largest detected face isn't the subject. Absent slugs use
// the default "largest face" pick. Keys starting with "_" (e.g. "_comment")
// are never slugs, so they're ignored by lookup.
function loadPortraitSubjectMap(): Record<string, number> {
  const p = path.resolve("./src/data", "portrait-subjects.json");
  if (!existsSync(p)) return {};
  try {
    return (JSON.parse(readFileSync(p, "utf8")) as Record<string, number>) ?? {};
  } catch {
    return {};
  }
}
const PORTRAIT_SUBJECT_MAP = loadPortraitSubjectMap();

/**
 * Write a docx image attachment to `outputDir` as `<stem>.<ext>`.
 *
 * If the attachment's extension is a web format (png/jpg/jpeg/gif/svg), the
 * buffer is written as-is. For non-web formats (EMF/WMF/TIFF/etc.) we shell
 * out to LibreOffice (`soffice --headless --convert-to png`) and write a PNG.
 * The resulting filename is returned (extension may differ from the input).
 *
 * Returns null if no writable file results. Conversion is cached.
 */
async function writeImageAttachment(
  attachment: { base64: string; name: string; extension: string },
  stem: string,
  outputDir: string,
): Promise<string | null> {
  const ext = (attachment.extension || "").toLowerCase();
  const buffer = Buffer.from(attachment.base64, "base64");

  if (!existsSync(outputDir)) {
    await fs.mkdir(outputDir, { recursive: true });
  }

  if (WEB_IMAGE_EXTS.has(ext)) {
    const filename = `${stem}.${ext}`;
    const outputPath = path.join(outputDir, filename);
    if (!existsSync(outputPath)) {
      await fs.writeFile(outputPath, buffer);
    }
    return filename;
  }

  // Non-web format — convert via LibreOffice to PNG.
  const filename = `${stem}.png`;
  const outputPath = path.join(outputDir, filename);
  if (existsSync(outputPath)) {
    console.warn(
      `[docx] ${stem}: image is "${ext}" (not web-compatible); using cached converted PNG`,
    );
    return filename;
  }

  const tmpDir = path.join(
    "/tmp",
    `docx-img-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpInput = path.join(tmpDir, attachment.name);

  try {
    await fs.writeFile(tmpInput, buffer);
    execSync(
      `soffice --headless --convert-to png --outdir "${tmpDir}" "${tmpInput}"`,
      { stdio: "pipe", timeout: 30_000 },
    );
    const baseName = attachment.name.replace(/\.[^.]+$/, "");
    const convertedPath = path.join(tmpDir, `${baseName}.png`);
    if (!existsSync(convertedPath)) {
      throw new Error("LibreOffice did not produce a .png output");
    }
    await fs.copyFile(convertedPath, outputPath);
    console.warn(
      `[docx] ${stem}: converted "${ext}" image to PNG via LibreOffice`,
    );
    return filename;
  } catch (err) {
    console.warn(
      `[docx] ${stem}: failed to convert "${ext}" image — image will not render. (${(err as Error).message})`,
    );
    return null;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// --- Utility functions copied from globLoader.ts ---
/**
 * Convert a platform path to a posix path.
 */
function posixifyPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

/**
 * Unlike `path.posix.relative`, this function will accept a platform path and return a posix path.
 */
export function posixRelative(from: string, to: string) {
  return posixifyPath(path.relative(from, to));
}

function getRelativeEntryPath(entry: URL, collection: string, contentDir: URL) {
  const relativeToContent = path.relative(
    fileURLToPath(contentDir),
    fileURLToPath(entry),
  );
  const relativeToCollection = path.relative(collection, relativeToContent);
  return relativeToCollection;
}

// NOTE: ContentPaths is not defined here, assuming it's an internal type from Astro.
// For scaffolding, I'll define a minimal interface or cast to any.
interface MinimalContentPaths {
  contentDir: URL;
}

export function getContentEntryIdAndSlug({
  entry,
  contentDir,
  collection,
}: Pick<MinimalContentPaths, "contentDir"> & {
  entry: URL;
  collection: string;
}): {
  id: string;
  slug: string;
} {
  const relativePath = getRelativeEntryPath(entry, collection, contentDir);
  const withoutFileExt = relativePath.replace(
    new RegExp(path.extname(relativePath) + "$"),
    "",
  );
  const rawSlugSegments = withoutFileExt.split(path.sep);

  const slug = rawSlugSegments
    // Slugify each route segment to handle capitalization and spaces.
    // Note: using `slug` instead of `new Slugger()` means no slug deduping.
    .map((segment) => githubSlug(segment))
    .join("/")
    .replace(/\/index$/, "");

  const res = {
    id: posixifyPath(relativePath), // Using posixifyPath here instead of normalizePath
    slug,
  };
  return res;
}
// --- End Utility functions copied from globLoader.ts ---

interface GenerateIdOptions {
  /** The path to the entry file, relative to the base directory. */
  entry: string;

  /** The base directory URL. */
  base: URL;
  /** The parsed, unvalidated data of the entry. */
  data: Record<string, unknown>;
}

interface DocxGlobOptions {
  /** The glob pattern to match files, relative to the base directory */
  pattern: string | Array<string>;
  /** The base directory to resolve the glob pattern from. Relative to the root directory, or an absolute file URL. Defaults to `.` */
  base?: string | URL;
  /**
   * Function that generates an ID for an entry. Default implementation generates a slug from the entry path.
   * @returns The ID of the entry. Must be unique per collection.
   **/
  generateId?: (options: GenerateIdOptions) => string;
  /**
   * Retains the unparsed body of the file in the data store, in addition to the rendered HTML.
   * If `false`, `entry.body` will be undefined if the content type has a parser.
   * Defaults to `true`.
   */
  retainBody?: boolean;
}

function generateIdDefault({ entry, base, data }: GenerateIdOptions): string {
  if (data.slug) {
    return data.slug as string;
  }
  const entryURL = new URL(encodeURI(entry), base);
  const { slug } = getContentEntryIdAndSlug({
    entry: entryURL,
    contentDir: base, // Assuming base can act as contentDir here
    collection: "",
  });
  return slug;
}

// --- Docx specific ContentEntryType ---
const docxEntryType: ContentEntryType = {
  name: "Docx",
  getEntryInfo: async ({ contents, fileUrl }) => {
    const filePath = fileURLToPath(fileUrl);

    let extracted: ReturnType<typeof extractAll>["value"] | null = null;
    let warnings: ReturnType<typeof extractAll>["warnings"] = [];

    try {
      const ast = await OfficeParser.parseOffice(filePath, {
        extractAttachments: true,
      });
      const result = extractAll(ast);
      extracted = result.value;
      warnings = result.warnings;
    } catch (error) {
      console.error(`Error parsing DOCX file ${filePath}: ${error}`);
    }

    // Image pipeline:
    //   src/assets/bios-extracted/<slug>.<ext>  — raw docx attachment, kept for
    //       reference so we can compare what the author shipped vs. what renders.
    //   src/content/bios-images/<slug>.<ext>    — optional high-res override
    //       (AI-upscaled or manually-sourced). When present, this is what
    //       gets rendered.
    //   src/assets/bios/<slug>.<ext>            — the active image (override
    //       if available, else the extracted original). Site reads from here.
    //   src/assets/bios/<slug>-portrait.jpg     — face-detected portrait crop
    //       of the active image, for the grid view.
    let imageFn = "";
    let imagePortraitFn = "";
    const slug = basename(filePath, path.extname(filePath))
      .replaceAll(" ", "-")
      .toLowerCase();
    const activeDir = path.resolve("./src/assets/bios");
    const extractedDir = path.resolve("./src/assets/bios-extracted");
    const overrideDir = path.resolve("./src/content/bios-images");

    // 1) Always extract the docx attachment to bios-extracted/ (regenerable
    //    reference; gitignored). LibreOffice-converted PNGs land here too.
    let extractedPath: string | null = null;
    if (extracted?.imageAttachment) {
      const written = await writeImageAttachment(
        extracted.imageAttachment,
        slug,
        extractedDir,
      );
      if (written) extractedPath = path.join(extractedDir, written);
    }

    // 2) Pick the active source: override if it exists, else the extracted
    //    original.
    let activeSrc: string | null = null;
    for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif"]) {
      const candidate = path.join(overrideDir, slug + ext);
      if (existsSync(candidate)) {
        activeSrc = candidate;
        console.warn(
          `[docx] ${basename(filePath)}: using override → ${basename(candidate)}`,
        );
        break;
      }
    }
    if (!activeSrc && extractedPath) activeSrc = extractedPath;

    // 3) Copy active source to bios/<slug>.<ext> (the file the site reads).
    let activePath: string | null = null;
    if (activeSrc) {
      if (!existsSync(activeDir)) {
        await fs.mkdir(activeDir, { recursive: true });
      }
      const ext = path.extname(activeSrc);
      const fn = `${slug}${ext}`;
      activePath = path.join(activeDir, fn);
      await fs.copyFile(activeSrc, activePath);
      imageFn = fn;
    }

    // 4) Generate the face-detected portrait crop next to the active image.
    if (activePath) {
      const portraitFn = `${slug}-portrait.jpg`;
      const portraitPath = path.join(activeDir, portraitFn);
      if (existsSync(portraitPath)) {
        imagePortraitFn = portraitFn;
      } else {
        try {
          const { cropToPortrait } = await import(
            "../../scripts/crop-portrait.ts"
          );
          const { usedFace } = await cropToPortrait(
            activePath,
            portraitPath,
            PORTRAIT_SUBJECT_MAP[slug],
          );
          imagePortraitFn = portraitFn;
          console.warn(
            `[docx] ${basename(filePath)}: portrait${usedFace ? "" : " (saliency fallback)"} → ${portraitFn}`,
          );
        } catch (err) {
          console.warn(
            `[docx] ${basename(filePath)}: portrait crop failed — ${(err as Error).message}`,
          );
        }
      }
    }

    if (warnings.length > 0) {
      const errors = warnings.filter((w) => w.severity === "error");
      if (errors.length > 0) {
        console.warn(
          `[docx] ${basename(filePath)}: ${errors.length} parser error(s):`,
        );
        for (const e of errors) console.warn(`  - ${e.code}: ${e.message}`);
      }
    }

    const data = {
      title: path.basename(filePath, path.extname(filePath)),
      firstName: extracted?.firstName ?? "",
      lastName: extracted?.lastName ?? "",
      knownAs: extracted?.knownAs,
      nee: extracted?.nee,
      summary: extracted?.summary ?? "",
      image: {},
      imageFn,
      imagePortraitFn,
      imageSource: extracted?.imageSource ?? "",
      life: extracted?.life ?? "",
      introNotes: extracted?.introNotes ?? [],
      roles: extracted?.roles ?? [],
      archives: extracted?.archives ?? { items: [] },
      publications: extracted?.publications ?? { items: [] },
      literature: extracted?.literature ?? { items: [] },
      version: extracted?.version ?? "",
      authors: extracted?.authors ?? "",
      nationality: extracted?.nationality ?? undefined,
      country: extracted?.country ?? "",
      html: extracted?.html ?? "",
    };

    // Inject the per-entry Zenodo DOIs (if minted), keyed by the canonical route
    // slug. NOTE: this equals page.id only because all bios are flat files; if a
    // bio is ever nested in a subdir, page.id becomes "subdir/slug" while this
    // key stays the bare slug — re-key here if that ever changes.
    const doiKey = githubSlug(basename(filePath, path.extname(filePath)));
    const doi = DOI_MAP[doiKey];
    if (doi && (!doi.env || doi.env === DOI_ENV)) {
      if (
        DOI_ENV === "production" &&
        (isSandboxDoi(doi.versionDoi) || isSandboxDoi(doi.conceptDoi))
      ) {
        console.warn(`[docx] ${doiKey}: ignoring sandbox DOI under production env`);
      } else {
        if (doi.versionDoi) (data as Record<string, unknown>).versionDoi = doi.versionDoi;
        if (doi.conceptDoi) (data as Record<string, unknown>).conceptDoi = doi.conceptDoi;
      }
    }

    // Build the per-entry citation for "How to cite" (issue #2). Prefer a real
    // production DOI (resolves via doi.org); otherwise fall back to the sandbox
    // deposit's CONCEPT record (always-latest version) so the client can preview
    // the per-entry citation now. concept > version. Sandbox DOIs (10.5072) are
    // NOT used as doi.org links — they don't resolve — so they route to the
    // sandbox.zenodo.org record URL instead.
    const dataConcept = (data as Record<string, unknown>).conceptDoi as string | undefined;
    const dataVersion = (data as Record<string, unknown>).versionDoi as string | undefined;
    const prodDoi = [dataConcept, dataVersion].find((d) => d && !isSandboxDoi(d));
    const sb = SANDBOX_MAP[doiKey];
    if (prodDoi) {
      (data as Record<string, unknown>).zenodoCite = {
        url: `https://doi.org/${prodDoi}`,
        sandbox: false,
      };
    } else if (sb && (sb.conceptRecId || sb.recordId)) {
      const recId = sb.conceptRecId ?? sb.recordId;
      (data as Record<string, unknown>).zenodoCite = {
        url: `https://sandbox.zenodo.org/records/${recId}`,
        sandbox: true,
      };
    }

    return {
      body: extracted?.body ?? "",
      data,
    };
  },
  getRenderFunction: async (config) => {
    const render: ContentEntryRenderFunction = async ({
      id,
      data,
      body,
      filePath,
      digest,
    }) => {
      return {
        html: (body || "<p>No content found for this DOCX file.</p>") as any,
        metadata: {},
      };
    };
    return render;
  },
  contentModuleTypes: [".docx"],
};
// --- End Docx specific ContentEntryType ---

export function docxLoader(globOptions: DocxGlobOptions): Loader {
  // Force retainBody to true for DOCX so the parsed content is available in `entry.body`
  globOptions.retainBody = true;
  const generateId =
    globOptions?.generateId ??
    ((opts: GenerateIdOptions) => generateIdDefault(opts));

  const fileToIdMap = new Map<string, string>();

  return {
    name: "docx-loader",
    load: async ({
      config,
      collection,
      logger,
      watcher,
      parseData,
      store,
      generateDigest,
      entryTypes,
    }) => {
      const renderFunctionByContentType = new WeakMap<
        ContentEntryType,
        ContentEntryRenderFunction
      >();
      // start fresh
      store.clear();
      // Ensure .docx entry type is registered
      if (!entryTypes.has(".docx")) {
        // console.log("not has docx");
        entryTypes.set(".docx", docxEntryType);
      } else {
        // console.log("has docx");

        // If it already exists, merge contentModuleTypes to avoid overwriting
        const existingEntryType = entryTypes.get(".docx");
        if (existingEntryType && docxEntryType.contentModuleTypes) {
          existingEntryType.contentModuleTypes = Array.from(
            new Set([
              ...(existingEntryType.contentModuleTypes || []),
              ...docxEntryType.contentModuleTypes,
            ]),
          );
        }
      }

      const untouchedEntries = new Set(store.keys());

      async function syncData(
        entry: string,
        base: URL,
        entryType?: ContentEntryType,
        oldId?: string,
      ) {
        if (!entryType) {
          logger.warn(`No entry type found for ${entry}`);
          return;
        }
        const fileUrl = new URL(encodeURI(entry), base);
        const filePath = fileURLToPath(fileUrl);

        if (!existsSync(filePath)) {
          logger.warn(`File ${filePath} does not exist.`);
          return;
        }
        // Read as buffer for digest, but officeparser uses path
        const fileBuffer = await fs.readFile(filePath);
        const digest = generateDigest(fileBuffer);

        const { body, data } = await entryType.getEntryInfo({
          contents: "", // Dummy string as officeparser uses path
          fileUrl,
        });

        // console.log("data is", data);
        // console.log("body is", body);
        // console.log(countries);

        const id = generateId({ entry, base, data });

        if (oldId && oldId !== id) {
          store.delete(oldId);
        }

        untouchedEntries.delete(id);

        const existingEntry = store.get(id);

        if (
          existingEntry &&
          existingEntry.digest === digest &&
          existingEntry.filePath
        ) {
          console.log("existing entry");
          if (existingEntry.deferredRender) {
            store.addModuleImport(existingEntry.filePath);
          }
          fileToIdMap.set(filePath, id);
          return;
        }

        const relativePath = posixRelative(
          fileURLToPath(config.root),
          filePath,
        );

        // console.log("data here", data);

        let parsedData = data;
        // TODO(Tibor): check why this overrides the data with nothing
        const parse = false;
        if (parse && parseData) {
          parsedData = await parseData({
            id,
            data,
            filePath,
          });
        }

        // console.log("data here", parsedData);

        if (
          existingEntry &&
          existingEntry.filePath &&
          existingEntry.filePath !== relativePath
        ) {
          const oldFilePath = new URL(existingEntry.filePath, config.root);
          if (existsSync(oldFilePath)) {
            logger.warn(
              `Duplicate id "${id}" found in ${filePath}. Later items with the same id will overwrite earlier ones.`,
            );
          }
        }

        let render = renderFunctionByContentType.get(entryType);
        if (!render) {
          render = await entryType.getRenderFunction(config);
          renderFunctionByContentType.set(entryType, render);
        }
        let rendered: RenderedContent | undefined = undefined;

        try {
          rendered = await render?.({
            id,
            data,
            body,
            filePath,
            digest,
          });
          // console.log("rendered", rendered);
        } catch (error: any) {
          logger.error(`Error rendering ${entry}: ${error.message}`);
        }

        store.set({
          id,
          data: parsedData,
          body: globOptions.retainBody === false ? undefined : body,
          filePath: relativePath,
          digest,
          rendered,
          assetImports: rendered?.metadata?.imagePaths,
        });

        fileToIdMap.set(filePath, id);
      }

      let baseDir: URL;
      if (!globOptions.base) {
        baseDir = new URL(`./src/content/${collection}`, config.root);
      } else {
        baseDir = new URL(globOptions.base, config.root);
      }

      if (!baseDir.pathname.endsWith("/")) {
        baseDir.pathname = `${baseDir.pathname}/`;
      }

      const basePath = fileURLToPath(baseDir);
      const relativeBaseDirPath = relative(
        fileURLToPath(config.root),
        basePath,
      );

      if (!existsSync(basePath)) {
        logger.warn(`The base directory "${basePath}" does not exist.`);
        return;
      }

      const files = await tinyglobby(globOptions.pattern, {
        cwd: basePath,
        expandDirectories: false,
      });

      if (files.length === 0) {
        logger.warn(
          `No files found matching "${globOptions.pattern}" in directory "${relativeBaseDirPath}"`,
        );
        return;
      }

      function configForFile(file: string) {
        const ext = path.extname(file);
        return entryTypes.get(ext);
      }

      const limit = pLimit(10);

      await Promise.all(
        files.map((entry) => {
          return limit(async () => {
            const entryType = configForFile(entry);
            await syncData(entry, baseDir, entryType);
          });
        }),
      );

      // Remove entries that were not found this time
      untouchedEntries.forEach((id) => store.delete(id));

      if (!watcher) {
        return;
      }

      watcher.add(basePath);

      const matchesGlob = (entry: string) =>
        !entry.startsWith("../") &&
        picomatch.isMatch(entry, globOptions.pattern);

      async function onChange(changedPath: string) {
        const entry = posixRelative(basePath, changedPath);
        if (!matchesGlob(entry)) {
          return;
        }
        const entryType = configForFile(changedPath);
        const baseUrl = pathToFileURL(basePath);
        const oldId = fileToIdMap.get(changedPath);
        await syncData(entry, baseUrl, entryType, oldId);
        logger.info(`Reloaded data from ${colors.green(entry)}`);
      }

      watcher.on("change", onChange);
      watcher.on("add", onChange);
      watcher.on("unlink", async (deletedPath) => {
        const entry = posixRelative(basePath, deletedPath);
        if (!matchesGlob(entry)) {
          return;
        }
        const id = fileToIdMap.get(deletedPath);
        if (id) {
          store.delete(id);
          fileToIdMap.delete(deletedPath);
        }
      });
    },
  };
}
