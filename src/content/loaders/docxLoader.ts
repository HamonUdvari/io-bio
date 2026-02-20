import { existsSync, promises as fs } from "node:fs";
import { relative } from "node:path";
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
import officeparser from "officeparser";
import { OfficeParser } from "officeparser";
import path from "node:path";
import { slug as githubSlug } from "github-slugger";
import { h } from "hastscript";
import { toHtml } from "hast-util-to-html";
import { nameCase } from "@foundernest/namecase";
import countries from "world-countries/countries.json";
import internationalOrganisations from "./ios.json";

/*
 * Transform officeparser AST nodes into HAST nodes
 * */
function transformNode(node) {
  if (node.type === "text") {
    let element = node.text || "";

    // Wrap in formatting tags if necessary
    if (node.formatting?.bold) element = h("strong", element);
    if (node.formatting?.italic) element = h("em", element);
    if (node.formatting?.underline) element = h("u", element);

    return element;
  }

  // Recursively process children
  const children = (node.children || []).map(transformNode);

  // Map officeparser types to HTML tags
  switch (node.type) {
    case "paragraph":
      return h("p", children);
    case "heading":
      const level = node.metadata?.level || 1;
      return h(`h${level}`, children);
    case "list":
      // Note: officeparser usually gives items;
      // higher-level logic may be needed to wrap in <ul>
      return h("li", children);
    case "table":
      return h("table", h("tbody", children));
    case "row":
      return h("tr", children);
    case "cell":
      return h("td", children);
    default:
      // Return just the children if the type isn't recognized
      return children;
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
    let html = "";

    let firstName = "";
    let lastName = "";
    let knownAs = "";
    let title = "";
    let life = "";

    let image = {};
    let imageSource = "";

    let archives = "";
    let publications = "";
    let literature = "";
    let version = "";
    let authors = "";
    let body = "";
    let organisation = "";
    let nationality = "";
    let country = "";
    let startYear = "";
    let endYear = "";

    let extractedNodes = [];

    try {
      const ast = await OfficeParser.parseOffice(filePath, {
        extractAttachments: true,
      });

      const imageSourceNode = ast.content.find(
        (c) => c.type === "paragraph" && c.text.startsWith("Source:"),
      );
      const sourceMatch = imageSourceNode.text.match(/Source:\s*(.+)/i);
      if (sourceMatch) {
        imageSource = sourceMatch[1].trim();
        extractedNodes.push(imageSourceNode);
      }

      const introNode = ast.content.at(0);
      extractedNodes.push(introNode);

      const str = introNode.text;
      // const nameMatch = str.match(
      //   /^([^,]+),\s*([^,(]+(?: [^,(]+)*)(?:\s*\(known as\s+(.+?)\))?,/i,
      // );
      const nameMatch = str.match(
        /^([^,]+),\s*([^(,]+)(?:\s*\((?:known as|née)\s+(.+?)\))?,/i,
      );

      if (nameMatch) {
        lastName = nameCase(nameMatch[1].trim());
        firstName = nameMatch[2].trim();
        knownAs = nameMatch[3]?.trim(); // undefined if not present
      }

      const lifeMatch = str.match(/(was.+)$/i);
      if (lifeMatch) {
        life = lifeMatch[1].trim();
        if (life && life.length > 1) {
          life = life.charAt(0).toUpperCase() + life.slice(1);
        }
      }

      const titleMatch = str.match(/^[^,]+,\s*[^,]+,\s*(.+?)\s*,\s*was born/i);

      if (titleMatch) {
        title = titleMatch[1].trim();

        const orgMatch = title.match(/\(([^)]+)\)/);
        if (orgMatch) {
          organisation = orgMatch[1].trim();
        }

        if (!orgMatch) {
          console.log("did not find org");
          const ios = internationalOrganisations;
          const io = ios.find((io) => {
            return title.includes(io.name);
          });
          if (io) {
            organisation = io.abbreviation || io.name;
          }
        }

        // TODO: This will fail for exceptions like “Dutch,” “Finn,” “French,” or multi-word nationalities (“South African”)
        // const natMatch = title.match(/\b(\w+(?:ian|ese|ish|i|ic))\b/i);
        // if (natMatch) {
        //   nationality = natMatch[1].trim();
        // }

        let countryObject = countries.find((c) => {
          // console.log("country", c)
          if (!c.unMember) {
            return false;
          }
          const femaleDem = c.demonyms?.eng?.f || "UNDEFINED";
          const maleDem = c.demonyms?.eng?.m || "UNDEFINED";
          return title.includes(femaleDem) || title.includes(maleDem);
        });

        if (!countryObject) {
          // Problem with atlanta georgia
          //
          // countryObject = countries.find((c) => {
          //   if (!c.unMember) {
          //     return false;
          //   }
          //   const commonName = c.name.common;
          //   return title.includes(commonName) || life.includes(commonName);
          // });
        }

        if (countryObject) {
          console.log("found country", countryObject);
          country = countryObject.name.common;
          const femaleDem = countryObject.demonyms?.eng?.f || "UNDEFINED";
          const maleDem = countryObject.demonyms?.eng?.m || "UNDEFINED";

          if (title.includes(femaleDem)) {
            nationality = femaleDem;
          }

          if (title.includes(maleDem)) {
            nationality = maleDem;
          }
        }

        const yearsMatch = title.match(/(\d{4})-(\d{4})/);
        if (yearsMatch) {
          startYear = yearsMatch[1];
          endYear = yearsMatch[2];
        }
      }

      // Version
      const versionNode = ast.content.find(
        (c) => c.type === "paragraph" && c.text.startsWith("Version"),
      );

      if (versionNode) {
        version = versionNode.text;
        extractedNodes.push(versionNode);
      }

      const citationNode = ast.content.find(
        (c) =>
          c.type === "paragraph" &&
          c.text.includes(
            "in IO BIO, Biographical Dictionary of Secretaries-General",
          ),
      );

      if (citationNode) {
        authors = citationNode.text.split(",")[0].trim();
        extractedNodes.push(citationNode);
      }

      if (ast.attachments && ast.attachments.length > 0) {
        image = ast.attachments.at(0);
      }

      const extractSectionNodes = (label: string) => {
        const startIndex = ast.content.findIndex(
          (n) => n.type === "paragraph" && n.text?.startsWith(label),
        );

        // console.log("label ", label, "start index", startIndex);
        const nodes: any[] = [];
        if (startIndex >= 0) {
          // const head = structuredClone(ast.content.at(startIndex));
          const head = ast.content.at(startIndex);

          head.children = head.children.filter((cn: any) => {
            const t = typeof cn.text === "string" ? cn.text.trim() : cn.text;
            return t !== label && t !== ":";
          });

          nodes.push(head);
          let i = startIndex + 1;
          let exit = false;
          while (!exit) {
            if (i > ast.content.length - 1) {
              exit = true;
              continue;
            }
            const node = ast.content.at(i);
            if (
              node &&
              node.children &&
              node.children.at(0) &&
              node.children.at(0)?.formatting?.bold
            ) {
              exit = true;
              continue;
            }
            nodes.push(node);
            i++;
          }

          return nodes;
        }
        return "";
      };

      const archiveNodes = extractSectionNodes("ARCHIVES");
      const publicationsNodes = extractSectionNodes("PUBLICATIONS");
      const literatureNodes = extractSectionNodes("LITERATURE");

      const archiveHastTree = h(null, archiveNodes.map(transformNode));
      const publicationsHastTree = h(
        null,
        publicationsNodes.map(transformNode),
      );
      const literatureHastTree = h(null, literatureNodes.map(transformNode));

      archives = toHtml(archiveHastTree);
      publications = toHtml(publicationsHastTree);
      literature = toHtml(literatureHastTree);

      extractedNodes = [
        ...extractedNodes,
        ...archiveNodes,
        ...publicationsNodes,
        ...literatureNodes,
      ];

      const howToCiteNode = ast.content.find(
        (c) =>
          c.type === "paragraph" &&
          c.text.toLowerCase().includes("how to cite this io bio entry"),
      );
      if (howToCiteNode) {
        extractedNodes.push(howToCiteNode);
      }

      const authorNode = ast.content.find(
        (c) =>
          c.type === "paragraph" &&
          c.text.toLowerCase().includes(authors.toLowerCase()),
      );
      if (authorNode) {
        extractedNodes.push(authorNode);
      }

      const remainingNodes = ast.content.filter(
        (n) =>
          !extractedNodes.some((e) => JSON.stringify(e) === JSON.stringify(n)),
      );

      // const remainingNodes = ast.content.filter(
      //   (n) => !extractedNodes.includes(n),
      // );
      const bodyHastTree = remainingNodes.map(transformNode);
      body = toHtml(bodyHastTree);

      const hastTree = h(null, ast.content.map(transformNode));
      html = toHtml(hastTree);
    } catch (error) {
      // Log the error but don't prevent processing
      console.error(`Error parsing DOCX file ${filePath}: ${error}`);
    }

    const data = {
      title: path.basename(filePath, path.extname(filePath)),
      firstName,
      lastName,
      knownAs,
      summary: title,
      image,
      imageSource,
      life,
      archives,
      publications,
      literature,
      version,
      authors,
      organisation,
      nationality,
      country,
      startYear,
      endYear,
      html,
    };

    return {
      body,
      data: data,
    };
  },
  getRenderFunction: async (config) => {
    console.log("GET RENDER FUNCTION");

    // console.log("get render function", "config", config);
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
        console.log("not has docx");
        entryTypes.set(".docx", docxEntryType);
      } else {
        console.log("has docx");

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

        console.log("body deconstruct");
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

        console.log("here");
        let render = renderFunctionByContentType.get(entryType);
        console.log("render is", render);
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
