import { useEffect, useState } from "preact/hooks";
import clsx from "clsx";
import { extractAll } from "../loaders/parsers/extractAll";
import type { ExtractedBio, Warning } from "../loaders/parsers/types";
import { aliasSuffix } from "@utils/displayName";

// Pinned CDN copy of officeparser's classic-script bundle. We can't bundle
// it through Vite because the IIFE relies on `var officeParser` binding to
// window, and Vite would rewrite the file as an ES module. Keep the version
// here aligned with the devDependency in package.json.
const OFFICEPARSER_URL =
  "https://cdn.jsdelivr.net/npm/officeparser@6.0.4/dist/officeparser.browser.js";

type ParseState =
  | { kind: "idle" }
  | { kind: "loading"; filename: string }
  | {
      kind: "ready";
      filename: string;
      bio: ExtractedBio;
      warnings: Warning[];
    }
  | { kind: "error"; filename: string; message: string };

let opPromise: Promise<any> | null = null;

function ensureOfficeparser(): Promise<any> {
  if (opPromise) return opPromise;
  opPromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      return reject(new Error("No document"));
    }
    const g = globalThis as any;
    if (g.officeParser) return resolve(g.officeParser);

    const script = document.createElement("script");
    script.src = OFFICEPARSER_URL;
    script.async = true;
    script.onload = () => {
      const op = (globalThis as any).officeParser;
      if (op) resolve(op);
      else reject(new Error("Bundle loaded but window.officeParser missing"));
    };
    script.onerror = () =>
      reject(new Error("Failed to load officeparser browser bundle"));
    document.head.appendChild(script);
  }).catch((err) => {
    // Reset so the next call can retry.
    opPromise = null;
    throw err;
  });
  return opPromise;
}

function bySeverity(warnings: Warning[]) {
  const buckets: Record<Warning["severity"], Warning[]> = {
    error: [],
    warn: [],
    info: [],
  };
  for (const w of warnings) buckets[w.severity].push(w);
  return buckets;
}

export default function PreviewPanel() {
  const [state, setState] = useState<ParseState>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    setState({ kind: "loading", filename: file.name });
    try {
      const parser = await ensureOfficeparser();
      const arrayBuffer = await file.arrayBuffer();
      const ast = await parser.parseOffice(arrayBuffer, {
        extractAttachments: true,
      });
      const { value, warnings } = extractAll(ast);
      setState({ kind: "ready", filename: file.name, bio: value, warnings });
    } catch (err: any) {
      setState({
        kind: "error",
        filename: file.name,
        message: err?.message ?? String(err),
      });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setState({
        kind: "error",
        filename: file.name,
        message: "Only .docx files are supported.",
      });
      return;
    }
    handleFile(file);
  }

  // Pre-load the bundle on mount so the first drop is responsive.
  useEffect(() => {
    ensureOfficeparser().catch(() => {});
  }, []);

  return (
    <div class="flex flex-col gap-y-(--gap-y)">
      <DropZone
        dragOver={dragOver}
        setDragOver={setDragOver}
        onDrop={onDrop}
        onFileChosen={handleFile}
        state={state}
      />
      {state.kind === "ready" && (
        <ResultPanel bio={state.bio} warnings={state.warnings} />
      )}
      {state.kind === "error" && (
        <div class="border border-red-500 p-4 bg-red-50 text-red-900">
          <strong>Error parsing {state.filename}:</strong> {state.message}
        </div>
      )}
    </div>
  );
}

function DropZone({
  dragOver,
  setDragOver,
  onDrop,
  onFileChosen,
  state,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: DragEvent) => void;
  onFileChosen: (f: File) => void;
  state: ParseState;
}) {
  const label =
    state.kind === "loading"
      ? `Parsing ${state.filename}…`
      : state.kind === "ready"
        ? `Parsed: ${state.filename} — drop another to try again`
        : state.kind === "error"
          ? `Drop a .docx to try again`
          : "Drop a .docx file here, or click to choose one";

  return (
    <label
      class={clsx(
        "block border-2 border-dashed p-8 text-center cursor-pointer",
        dragOver
          ? "border-io-brand bg-io-brand/10"
          : "border-io-gray-100/40",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        type="file"
        accept=".docx"
        class="hidden"
        onChange={(e) => {
          const file = (e.currentTarget as HTMLInputElement).files?.[0];
          if (file) onFileChosen(file);
        }}
      />
      {label}
    </label>
  );
}

function ResultPanel({
  bio,
  warnings,
}: {
  bio: ExtractedBio;
  warnings: Warning[];
}) {
  const buckets = bySeverity(warnings);

  return (
    <div class="grid grid-cols-1 desktop:grid-cols-[1fr_minmax(0,2fr)] gap-(--gap-x)">
      <aside class="flex flex-col gap-y-4">
        <WarningsPanel buckets={buckets} />
        {bio.imageAttachment && (
          <figure>
            <img
              src={`data:${
                bio.imageAttachment.mimeType ?? "image/png"
              };base64,${bio.imageAttachment.base64}`}
              alt="Embedded image"
              class="max-w-full"
            />
            {bio.imageSource && (
              <figcaption class="text-xs opacity-70 pt-1">
                Source: {bio.imageSource}
              </figcaption>
            )}
          </figure>
        )}
      </aside>
      <main class="flex flex-col gap-y-6">
        {/* How the name will appear on the published entry page — the same
            "LASTNAME, First" + aliasSuffix the entry page composes, so the
            née / known-as parenthetical shows exactly as it will render. */}
        <Field label="Display name">
          {`${(bio.lastName ?? "").toUpperCase()}, ${bio.firstName ?? ""}${aliasSuffix(bio.knownAs, `${bio.firstName ?? ""} ${bio.lastName ?? ""}`, bio.nee)}`}
        </Field>
        <Field label="Last name">{bio.lastName}</Field>
        <Field label="First name">{bio.firstName}</Field>
        {/* knownAs + nee always render (em-dash when empty) so an author can
            confirm the parser looked for them — not only when they are set. */}
        <Field label="Known as">{bio.knownAs}</Field>
        <Field label="Née">{bio.nee}</Field>
        <Field label="Summary">{bio.summary}</Field>
        <Field label="Life">{bio.life}</Field>
        <Field label="Nationality / country">
          {[bio.nationality, bio.country].filter(Boolean).join(" / ") || "—"}
        </Field>
        <Field label="Version">{bio.version}</Field>
        <Field label="Author(s)">{bio.authors}</Field>

        {/* Biography prose. Render bio.body — the nodes left AFTER the intro,
            version, citation and APL parsers claim theirs — NOT bio.html (the
            whole document). bio.body is exactly what the entry page's <Content />
            renders (docxLoader feeds extracted.body to the render fn), so the
            preview matches the site's separated result, not the raw Word text. */}
        <section>
          <h3 class="text-xl font-bold mb-2">Biography</h3>
          {bio.body && (
            <div
              class="text-sm border border-io-gray-100/30 p-3 max-h-96 overflow-auto flex flex-col gap-y-2"
              dangerouslySetInnerHTML={{ __html: bio.body }}
            />
          )}
          {!bio.body && <p class="opacity-60">No biography body extracted.</p>}
        </section>

        <section>
          <h3 class="text-xl font-bold mb-2">
            Roles ({bio.roles?.length ?? 0})
          </h3>
          {bio.roles?.length ? (
            <ol class="flex flex-col gap-y-3">
              {bio.roles.map((r, i) => (
                <li key={i} class="border border-io-gray-100/30 p-3">
                  <div>
                    <strong>{r.title}</strong>
                    {r.ordinalText && (
                      <span class="opacity-70"> ({r.ordinalText})</span>
                    )}
                  </div>
                  <div class="text-sm opacity-80">
                    {[r.organisation, r.abbreviation]
                      .filter(Boolean)
                      .join(" / ")}
                    {r.startYear || r.endYear ? (
                      <span> · {r.startYear ?? "?"}–{r.endYear ?? "?"}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p class="opacity-60">No roles extracted.</p>
          )}
        </section>

        <APLSection title="Archives" section={bio.archives} />
        <APLSection title="Publications" section={bio.publications} />
        <APLSection title="Literature" section={bio.literature} />
      </main>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: any;
}) {
  return (
    <div class="grid grid-cols-[10em_1fr] gap-x-3 text-sm">
      <dt class="opacity-60 uppercase tracking-wider text-xs">{label}</dt>
      <dd>{children || <span class="opacity-40">—</span>}</dd>
    </div>
  );
}

function APLSection({
  title,
  section,
}: {
  title: string;
  section: { items: { raw: string }[]; websitesAccessedOn?: string };
}) {
  if (!section?.items?.length) {
    return (
      <section>
        <h3 class="text-xl font-bold mb-1">{title}</h3>
        <p class="opacity-60 text-sm">(empty)</p>
      </section>
    );
  }
  return (
    <section>
      <h3 class="text-xl font-bold mb-1">
        {title} ({section.items.length})
      </h3>
      {section.items.length === 1 ? (
        <p>{section.items[0].raw}</p>
      ) : (
        <ul class="list-disc pl-6">
          {section.items.map((c, i) => (
            <li key={i}>{c.raw}</li>
          ))}
        </ul>
      )}
      {section.websitesAccessedOn && (
        <p class="text-xs opacity-60 pt-1">
          (all websites accessed {section.websitesAccessedOn})
        </p>
      )}
    </section>
  );
}

function WarningsPanel({
  buckets,
}: {
  buckets: Record<Warning["severity"], Warning[]>;
}) {
  const total = buckets.error.length + buckets.warn.length + buckets.info.length;
  return (
    <section class="border border-io-gray-100/30 p-3 text-sm">
      <h3 class="text-xl font-bold mb-2">
        Warnings ({total})
      </h3>
      {total === 0 && <p class="opacity-60">No issues detected.</p>}
      {(["error", "warn", "info"] as const).map((level) =>
        buckets[level].length > 0 ? (
          <div key={level} class="mb-2">
            <div
              class={clsx(
                "text-xs uppercase tracking-wider font-bold",
                level === "error"
                  ? "text-red-400"
                  : level === "warn"
                    ? "text-yellow-400"
                    : "opacity-70",
              )}
            >
              {level} ({buckets[level].length})
            </div>
            <ul class="list-disc pl-5">
              {buckets[level].map((w, i) => (
                <li key={i}>
                  <code class="text-xs opacity-70">{w.code}</code> · {w.message}
                  {w.field && (
                    <span class="opacity-60"> (field: {w.field})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  );
}
