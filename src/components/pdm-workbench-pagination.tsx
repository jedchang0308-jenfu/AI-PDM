"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export type PdmWorkbenchPaginationProps = {
  pageIndex: number;
  hasNextPage: boolean;
  hasPreviousPage?: boolean;
  loading?: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function PdmWorkbenchPagination({
  pageIndex,
  hasNextPage,
  hasPreviousPage,
  loading = false,
  onPrevious,
  onNext
}: PdmWorkbenchPaginationProps) {
  const canPrevious = hasPreviousPage ?? pageIndex > 0;
  if (!canPrevious && !hasNextPage) return null;

  return (
    <nav className="number-state-pagination pdm-workbench-pagination" aria-label="工作台分頁">
      <button className="secondary-button" type="button" disabled={!canPrevious || loading} onClick={onPrevious}>
        <ChevronLeft size={16} aria-hidden="true" />
        上一頁
      </button>
      <span aria-live="polite">第 {pageIndex + 1} 頁</span>
      <button className="secondary-button" type="button" disabled={!hasNextPage || loading} onClick={onNext}>
        下一頁
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
