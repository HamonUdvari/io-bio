import type { BioData, Role } from "../content.config";
import { aliasSuffix } from "../utils/displayName";

import * as React from "react";
import { type RankingInfo, rankItem } from "@tanstack/match-sorter-utils";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type FilterFn,
  getFilteredRowModel,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "preact/hooks";
import clsx from "clsx";

declare module "@tanstack/react-table" {
  interface FilterFns {
    fuzzy: FilterFn<unknown>;
  }
  interface FilterMeta {
    itemRank: RankingInfo;
  }
}

type ListViewProps = {
  data: (BioData & { slug: string })[];
};

function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 10,
  ...props
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  debounce?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value);
    }, debounce);

    return () => clearTimeout(timeout);
  }, [value]);

  return (
    <input
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

const fuzzyFilter: FilterFn<any> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
};

/**
 * Format an organisation for display. When the parser captured both the full
 * name and a parenthesised abbreviation, show "Full Name (ABBR)". Otherwise
 * fall back to whichever one is available.
 */
function formatOrg(role?: Role): string {
  if (!role) return "";
  const { organisation, abbreviation } = role;
  if (organisation && abbreviation) return `${organisation} (${abbreviation})`;
  return organisation ?? abbreviation ?? "";
}

export default function ListView({ data }: ListViewProps) {
  // Vite inlines this at build time, so it's the same on server + client and
  // tracks the configured base. Normalise to exactly one trailing slash (it may
  // be "/io-bio", "/io-bio/", or "/") so `${base}entries/${slug}` joins cleanly.
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");

  // Flatten bios × roles into one row per role. People with no roles still get
  // a single row so they show up in the list.
  const roleRows = useMemo(() => {
    const out: (BioData & {
      slug: string;
      role?: Role;
      roleIndex: number;
      personId: string;
    })[] = [];
    for (const bio of data) {
      if (!bio.roles || bio.roles.length === 0) {
        out.push({
          ...bio,
          role: undefined,
          roleIndex: -1,
          personId: bio.slug,
        });
      } else {
        bio.roles.forEach((role, i) => {
          out.push({ ...bio, role, roleIndex: i, personId: bio.slug });
        });
      }
    }
    return out;
  }, [data]);

  const columnHelper = createColumnHelper<(typeof roleRows)[number]>();

  const columns = [
    columnHelper.accessor((row) => row.slug, {
      id: "slug",
      header: "Slug",
      filterFn: "includesString",
    }),
    columnHelper.accessor(
      (row) =>
        `${row.lastName.toUpperCase()} ${row.firstName}${aliasSuffix(
          row.knownAs,
          `${row.firstName} ${row.lastName}`,
          row.nee,
        )}`,
      {
        id: "fullName",
        header: "Name",
        filterFn: "includesString",
      },
    ),
    columnHelper.accessor((row) => row.role?.title ?? "", {
      id: "role",
      header: "Title",
      filterFn: "includesString",
      // Display with non-breaking hyphens (U+2011) so compound titles like
      // "Secretary-General" wrap as a unit (at spaces) instead of splitting at
      // the hyphen. The accessor value keeps plain hyphens for search/sort.
      cell: (info) => info.getValue().replace(/-/g, "‑"),
    }),
    columnHelper.accessor((row) => formatOrg(row.role), {
      id: "organisation",
      header: "Organization",
      filterFn: "includesString",
    }),
    columnHelper.accessor((row) => row.nationality || "Unspecified", {
      id: "nationality",
      header: "Nationality",
      filterFn: "includesString",
    }),
    columnHelper.accessor(
      (row) => {
        const s = row.role?.startYear;
        const e = row.role?.endYear;
        if (s == null && e == null) return "";
        return `${s ?? ""}–${e ?? ""}`;
      },
      {
        id: "year",
        header: "Years",
        filterFn: "includesString",
      },
    ),
  ];

  // Default sort: surname A→Z, so the page lands sorted (equivalent to
  // ?sort=fullName:asc) and the Name column shows its sort triangle.
  const [sorting, setSorting] = useState<SortingState>([
    { id: "fullName", desc: false },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const v = params.get("view");
    const s = params.get("sort");

    if (q) setGlobalFilter(q);
    if (v === "grid") setView("grid");
    if (s) {
      const [id, dir] = s.split(":");
      if (id) setSorting([{ id, desc: dir === "desc" }]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (globalFilter) params.set("q", globalFilter);
    if (view !== "list") params.set("view", view);
    if (sorting.length > 0) {
      const s = sorting[0];
      params.set("sort", `${s.id}:${s.desc ? "desc" : "asc"}`);
    }
    const qs = params.toString();
    const next = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
    document.documentElement.classList.remove("entries-restoring");
  }, [hydrated, globalFilter, view, sorting]);

  const table = useReactTable({
    data: roleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
      globalFilter,
      columnVisibility: {
        slug: false,
      },
    },
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    filterFns: {
      fuzzy: fuzzyFilter,
    },
    globalFilterFn: "fuzzy",
  });

  const rows = table.getRowModel().rows;

  // Grid view shows one tile per person — dedupe by slug, keep the first row
  // (which still carries the full `roles` array via the underlying bio).
  const gridRows = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (seen.has(r.original.personId)) return false;
      seen.add(r.original.personId);
      return true;
    });
  }, [rows]);

  return (
    <div class="entries">
      <div class="entries__toolbar">
        <DebouncedInput
          value={globalFilter ?? ""}
          onChange={(value) => setGlobalFilter(String(value))}
          class="entries__search"
          placeholder="Search all columns..."
        />
        <div class="entries__view-toggle">
          <button
            onClick={() => setView("list")}
            class={clsx(
              "button button--primary",
              "entries__view-button entries__view-button--list",
              view === "list" && "button--active",
            )}
          >
            List
          </button>
          <button
            onClick={() => setView("grid")}
            class={clsx(
              "button button--primary",
              "entries__view-button entries__view-button--grid",
              view === "grid" && "button--active",
            )}
          >
            Portraits
          </button>
        </div>
      </div>
      {view === "grid" && (
        <div class="entries__grid">
          {gridRows.map((row) => {
            const { original } = row;
            const {
              webImage,
              firstName,
              lastName,
              roles = [],
              nationality,
              knownAs,
              nee,
              slug,
            } = original as any;
            // Issue #9: when an entry has no nationality (none stated in the
            // source and not safe to assume — e.g. special-status territories or
            // pre-nation-state historical figures), show "Unspecified" rather
            // than a fabricated demonym. (Renders plain; to de-emphasise it,
            // style "Unspecified" in the Nationality column / .entry__nationality.)
            const natLabel = nationality || "Unspecified";
            return (
              <a href={`${base}entries/${slug}`} class="entry" key={row.id}>
                {webImage && (
                  <img
                    class="entry__image"
                    src={webImage.src}
                    width={webImage.width}
                    height={webImage.height}
                  />
                )}
                <div class="entry__body">
                  <span class="entry__name" style={{ textBoxTrim: "trim-both" }}>
                    {lastName.toUpperCase()} {firstName}
                    {aliasSuffix(knownAs, `${firstName} ${lastName}`, nee)}
                  </span>
                  <ul class="entry__roles">
                    {roles.length === 0 && (
                      <li class="entry__role-item">
                        <span class="entry__nationality">{natLabel}</span>
                      </li>
                    )}
                    {roles.length > 0 &&
                      roles.map((r: Role, i: number) => (
                        <li class="entry__role-item" key={i}>
                          <span class="entry__organisation">
                            {formatOrg(r)}/
                          </span>
                          <span class="entry__role">{r.title} </span>
                          <span class="entry__years">
                            {r.startYear}–{r.endYear}
                          </span>
                          {i === roles.length - 1 && (
                            <>
                              {" "}
                              <span class="entry__nationality">{natLabel}</span>
                            </>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              </a>
            );
          })}
        </div>
      )}
      {view === "list" && (
        <div class="entries__table-scroll">
          <div class="entries-table" role="table">
            {table.getHeaderGroups().map((headerGroup) => (
              <div
                class="entries-table__row entries-table__row--header"
                role="row"
                key={headerGroup.id}
              >
                {headerGroup.headers.map((header) => (
                  <div
                    class={clsx(
                      "entries-table__cell entries-table__cell--header",
                      `entries-table__cell--${header.column.id}`,
                    )}
                    role="columnheader"
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </span>
                    <span
                      class={clsx(
                        "entries-table__sort-indicator",
                        !header.column.getIsSorted() &&
                          "entries-table__sort-indicator--inactive",
                      )}
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">
                        {{
                          asc: "arrow_upward",
                          desc: "arrow_downward",
                        }[header.column.getIsSorted() as string] ?? "unfold_more"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {(() => {
              // Group consecutive rows of the same person so hovering any of them
              // can light up the whole group. The wrapper uses `display: contents`
              // so it doesn't interfere with the subgrid layout.
              const groups: (typeof rows)[] = [];
              let currentId: string | null = null;
              for (const row of rows) {
                if (row.original.personId !== currentId) {
                  groups.push([]);
                  currentId = row.original.personId;
                }
                groups[groups.length - 1].push(row);
              }
              return groups.map((group, gi) => (
                <div
                  class="entries-table__group"
                  data-person-id={group[0].original.personId}
                  key={group[0].original.personId + ":" + gi}
                >
                  {group.map((row, i) => (
                    <a
                      key={row.id}
                      href={`${base}entries/${row.original.slug}`}
                      role="row"
                      data-person-id={row.original.personId}
                      class={clsx(
                        "entries-table__row",
                        i > 0 && "entries-table__row--continuation",
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <div
                          class={clsx(
                            "entries-table__cell",
                            `entries-table__cell--${cell.column.id}`,
                          )}
                          role="cell"
                          key={cell.id}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </div>
                      ))}
                    </a>
                  ))}
                </div>
              ));
            })()}
          </div>
        </div>
      )}
      <div class="entries__spacer" />
    </div>
  );
}
