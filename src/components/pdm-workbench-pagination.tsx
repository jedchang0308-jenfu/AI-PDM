"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export type PdmWorkbenchPaginationProps = {
  pageIndex: number;
  hasNextPage: boolean;
  loading?: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function PdmWorkbenchPagination({
  pageIndex,
  hasNextPage,
  loading = false,
  onPrevious,
  onNext
}: PdmWorkbenchPaginationProps) {
  if (pageIndex <= 0 && !hasNextPage) return null;

  return (
    <nav className="number-state-pagination pdm-workbench-pagination" aria-label="工作台分頁">
      <button className="secondary-button" type="button" disabled={pageIndex <= 0 || loading} onClick={onPrevious}>
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
