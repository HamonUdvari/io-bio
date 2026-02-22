import { h } from "preact";
import { signal } from "@preact/signals";
import type { BioData } from "../content.config";

import * as React from "react";
import ReactDOM from "react-dom/client";
import {
  type RankingInfo,
  rankItem,
  compareItems,
} from "@tanstack/match-sorter-utils";

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
import { useEffect, useState } from "preact/hooks";
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
  data: BioData[];
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
  console.log("fuzzy");
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value);

  // Store the itemRank info
  addMeta({
    itemRank,
  });

  // Return if the item should be filtered in/out
  return itemRank.passed;
};

type Slug = {
  slug: string;
};

export default function ListView({ data }: ListViewProps) {
  const columnHelper = createColumnHelper<BioData & Slug>();

  let columns = [
    columnHelper.accessor((row) => row.slug, {
      id: "slug",
      header: "Slug",
      filterFn: "includesString",
    }),
    columnHelper.accessor(
      (row) => `${row.lastName.toUpperCase()} ${row.firstName}`,
      {
        id: "fullName",
        header: "Name",
        filterFn: "includesString",
      },
    ),
    columnHelper.accessor((row) => row.role, {
      id: "role",
      header: "Title",
      filterFn: "includesString",
    }),
    columnHelper.accessor((row) => row.organisation, {
      id: "organisation",
      header: "Organisation",
      filterFn: "includesString",
    }),
    columnHelper.accessor((row) => row.nationality, {
      id: "nationality",
      header: "Nationality",
      filterFn: "includesString",
    }),
    columnHelper.accessor((row) => row.startYear, {
      id: "startYear",
      header: "Start Year",
      filterFn: "includesString",
    }),
    columnHelper.accessor((row) => row.endYear, {
      id: "endYear",
      header: "End Year",
      filterFn: "includesString",
    }),
    columnHelper.accessor((row) => row.authors, {
      id: "authors",
      header: "Author(s)",
      filterFn: "includesString",
    }),
  ];

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
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

  const [view, setView] = useState<"list" | "grid">("list");

  return (
    <div class="entries flex flex-col">
      <div class="flex flex-row">
        <DebouncedInput
          value={globalFilter ?? ""}
          onChange={(value) => setGlobalFilter(String(value))}
          class="w-full p-2 px-4 font-lg shadow ring ring-inset"
          placeholder="Search all columns..."
        />
        <div class="flex flex-row gap-x-1">
          <button
            onClick={() => {
              setView("list");
            }}
            class={clsx("button border-0", view === "list" && "bg-io-brand")}
          >
            List
          </button>
          <button
            onClick={() => {
              setView("grid");
            }}
            class={clsx("button border-0", view === "grid" && "bg-io-brand")}
          >
            Grid
          </button>
        </div>
      </div>
      {view === "grid" && (
        <div class="grid grid-cols-2 desktop:grid-cols-4 align-baseline items-baseline">
          {table.getRowModel().rows.map((row) => {
            const { original } = row;
            const {
              image,
              webImage,
              firstName,
              lastName,
              startYear,
              endYear,
              organisation,
              role,
              nationality,
              slug,
            } = original;
            return (
              <a href={`/entries/${slug}`}>
                <div
                  key={row.id}
                  class="entry leading-none flex flex-col gap-y-[1.25rem]"
                >
                {webImage && <img
                    class="w-full"
                    src={webImage.src}
                  />}

                  <div class="grid grid-cols-2 grid-rows-2 gap-x-2.5 gap-y-2.5">
                    <span class="entry__name">
                      {lastName.toUpperCase()} {firstName}
                    </span>
                    <span class="entry__years text-right">
                      {startYear}–{endYear}
                    </span>
                    <span class="entry__role">
                      {organisation}/{role}
                    </span>
                    <span class="entry__nationality text-right">
                      {nationality}
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
      {view === "list" && (
        <table class="table-auto">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div class="flex flex-row justify-between items-center">
                      <span>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </span>
                      <span class="text-[0.8em] leading-none h-min ">
                        {{
                          asc: "▲",
                          desc: "▼",
                        }[header.column.getIsSorted() as string] ?? " "}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} class="group" onClick={() => {
              }}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    <a href={`/entries/${row.original.slug}`}
onClick={(e) => e.stopPropagation()} // Let the <a> handle itself
                    class="group-hover:text-io-brand">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </a>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="h-4" />
    </div>
  );
}
