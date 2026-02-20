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

declare module "@tanstack/react-table" {
  //add fuzzy filter to the filterFns
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

export default function ListView({ data }: ListViewProps) {
  const columnHelper = createColumnHelper<BioData>();

  let columns = [
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
    },
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(), // <--- important

    filterFns: {
      fuzzy: fuzzyFilter, //define as a filter function that can be used in column definitions
    },
    globalFilterFn: "fuzzy",
  });

  console.log("Sorting state");
  console.log(table.getState().sorting);
  console.log("Global filter state");
  console.log(table.getState().globalFilter);

  return (
    <div className="p-2">
      <div>
        <DebouncedInput
          value={globalFilter ?? ""}
          onChange={(value) => setGlobalFilter(String(value))}
          className="p-2 font-lg shadow border border-block"
          placeholder="Search all columns..."
        />
      </div>
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {{
                    asc: " 🔼",
                    desc: " 🔽",
                  }[header.column.getIsSorted() as string] ?? null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-4" />
    </div>
  );
}
