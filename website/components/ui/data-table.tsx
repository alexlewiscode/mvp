"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  getRowLabel?: (row: TData) => string;
  renderExpandedRow?: (row: TData) => React.ReactNode;
  emptyMessage?: string;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  getRowLabel,
  renderExpandedRow,
  emptyMessage = "No results.",
}: DataTableProps<TData>) {
  const [expandedRowId, setExpandedRowId] = React.useState<string | null>(null);
  // TanStack's table instance is stateful and needs to remain live between renders.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  });

  function toggleRow(rowId: string) {
    setExpandedRowId((current) => (current === rowId ? null : rowId));
  }

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </TableHead>
            ))}
            {renderExpandedRow ? <TableHead className="w-8" /> : null}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length > 0 ? (
          table.getRowModel().rows.map((row) => {
            const expanded = expandedRowId === row.id;
            return (
              <React.Fragment key={row.id}>
                <TableRow
                  tabIndex={renderExpandedRow ? 0 : undefined}
                  aria-label={getRowLabel?.(row.original)}
                  aria-expanded={renderExpandedRow ? expanded : undefined}
                  className={
                    renderExpandedRow
                      ? "cursor-pointer focus-visible:bg-muted/50"
                      : undefined
                  }
                  onClick={
                    renderExpandedRow ? () => toggleRow(row.id) : undefined
                  }
                  onKeyDown={
                    renderExpandedRow
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleRow(row.id);
                          }
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                  {renderExpandedRow ? (
                    <TableCell className="w-8 text-muted-foreground">
                      <span className="sr-only">
                        {expanded ? "Hide details" : "Show details"}
                      </span>
                      {expanded ? (
                        <ChevronDown aria-hidden="true" className="size-4" />
                      ) : (
                        <ChevronRight aria-hidden="true" className="size-4" />
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
                {expanded && renderExpandedRow ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + 1}
                      className="whitespace-normal bg-muted/20 p-4"
                    >
                      {renderExpandedRow(row.original)}
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            );
          })
        ) : (
          <TableRow>
            <TableCell
              colSpan={columns.length + (renderExpandedRow ? 1 : 0)}
              className="h-24 text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
