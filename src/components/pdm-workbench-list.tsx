"use client";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, Ref } from "react";

export type PdmWorkbenchListColumn<Row> = {
  key: string;
  header: ReactNode;
  dataLabel?: string;
  className?: string;
  cellClassName?: string;
  ariaSort?: "ascending" | "descending" | "none";
  ariaHidden?: boolean;
  render?: (row: Row, index: number) => ReactNode;
};

type PdmWorkbenchListProps<Row> = {
  rows: readonly Row[];
  columns: readonly PdmWorkbenchListColumn<Row>[];
  getRowKey: (row: Row) => string;
  ariaLabel: string;
  selectedKey?: string | null;
  loading?: boolean;
  loadingState?: ReactNode;
  emptyState?: ReactNode;
  className?: string;
  tableClassName?: string;
  rowAriaKeyShortcuts?: string;
  rowDataAttribute?: `data-${string}`;
  containerRef?: Ref<HTMLDivElement>;
  onContainerKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onOpenRow?: (row: Row, index: number) => void;
  onRowKeyDown?: (event: ReactKeyboardEvent<HTMLTableRowElement>, row: Row, index: number) => void;
  onRowRef?: (row: Row, node: HTMLTableRowElement | null) => void;
  getGroupKey?: (row: Row) => string;
  getGroupAriaLabel?: (row: Row) => string;
};

export function PdmWorkbenchList<Row,>({
  rows,
  columns,
  getRowKey,
  ariaLabel,
  selectedKey = null,
  loading = false,
  loadingState,
  emptyState,
  className = "",
  tableClassName = "",
  rowAriaKeyShortcuts,
  rowDataAttribute,
  containerRef,
  onContainerKeyDown,
  onOpenRow,
  onRowKeyDown,
  onRowRef,
  getGroupKey,
  getGroupAriaLabel
}: PdmWorkbenchListProps<Row>) {
  if (loading && rows.length === 0) return <>{loadingState ?? <div className="empty">正在載入清單...</div>}</>;
  if (rows.length === 0) return <>{emptyState ?? null}</>;

  return (
    <div
      ref={containerRef}
      className={`table-wrap pdm-identity-scroll pdm-workbench-list-scroll ${className}`.trim()}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onContainerKeyDown}
    >
      <table className={`pdm-identity-table pdm-identity-table-compact pdm-workbench-list-table ${tableClassName}`.trim()}>
        <colgroup>
          {columns.map((column) => <col className={column.className} key={column.key} />)}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={column.cellClassName} aria-sort={column.ariaSort} aria-hidden={column.ariaHidden || undefined} key={column.key}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        {(getGroupKey ? [...new Map(rows.map((row) => [getGroupKey(row), rows.filter((candidate) => getGroupKey(candidate) === getGroupKey(row))])).values()] : [rows]).map((groupRows, groupIndex) => <tbody role={getGroupKey ? "rowgroup" : undefined} aria-label={getGroupKey && groupRows[0] ? getGroupAriaLabel?.(groupRows[0]) : undefined} key={getGroupKey ? String(groupIndex) : "all"}>
          {groupRows.map((row, index) => {
            const rowKey = getRowKey(row);
            const rowMarker = rowDataAttribute ? { [rowDataAttribute]: "true" } : {};
            return (
              <tr
                {...rowMarker}
                key={rowKey}
                ref={(node) => onRowRef?.(row, node)}
                className={selectedKey === rowKey ? "selected-row" : undefined}
                aria-selected={selectedKey === rowKey}
                aria-keyshortcuts={rowAriaKeyShortcuts}
                tabIndex={onOpenRow || onRowKeyDown ? 0 : undefined}
                onKeyDown={(event) => onRowKeyDown?.(event, row, index)}
                onClick={() => onOpenRow?.(row, index)}
              >
                {columns.map((column) => (
                  <td
                    className={column.cellClassName}
                    data-label={column.dataLabel}
                    aria-hidden={column.ariaHidden || undefined}
                    key={column.key}
                  >
                    {column.render?.(row, index)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>)}
      </table>
    </div>
  );
}
