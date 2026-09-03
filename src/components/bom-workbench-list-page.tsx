"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { PdmWorkbenchList } from "@/components/pdm-workbench-list";
import { SearchHighlight } from "@/components/search-highlight";
import { StatusBadge, StatusScopeHelp } from "@/components/status-help-popover";
import type { BomWorkbenchDraftStatus, BomWorkbenchListRecord } from "@/lib/types";

type StatusFilter = "" | BomWorkbenchDraftStatus;

export function BomWorkbenchListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<BomWorkbenchListRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ surface: "work_list" });
      if (query.trim()) params.set("query", query.trim());
      if (status) params.set("status", status);
      const response = await fetch(`/api/bom/drafts?${params.toString()}`);
      const body = await response.json().catch(() => ({})) as { drafts?: BomWorkbenchListRecord[]; message?: string; error?: string };
      if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
      setRows(body.drafts ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "載入 BOM 清單失敗");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    const legacyDraftId = new URLSearchParams(window.location.search).get("draftId");
    if (legacyDraftId) {
      const parentPartNumberId = new URLSearchParams(window.location.search).get("parentPartNumberId");
      const suffix = parentPartNumberId ? `?parentPartNumberId=${encodeURIComponent(parentPartNumberId)}` : "";
      router.replace(`/bom/workbench/${encodeURIComponent(legacyDraftId)}${suffix}`);
      return;
    }
    void load();
  }, [load, router]);

  const filteredRows = useMemo(() => rows, [rows]);

  return (
    <main className="bom-workbench-page bom-workbench-list-page">
      <header className="bom-workbench-header">
        <div>
          <h1>BOM 工作台 <StatusScopeHelp scope="bomWorkbench" /></h1>
          <p>搜尋並選擇要續作或查看的 BOM。</p>
        </div>
        <div className="bom-workbench-header-actions">
          <Link className="primary-button" href="/bom/create"><span aria-hidden="true">＋</span>建立 BOM</Link>
          <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><RotateCcw size={16} aria-hidden="true" />重新整理</button>
        </div>
      </header>

      {error ? <div className="bom-workbench-alert error" role="alert">{error}</div> : null}

      <section className="panel bom-list-panel" aria-label="BOM 清單工作區">
        <div className="bom-work-list-toolbar">
          <label className="bom-field bom-work-list-search">
            <span>搜尋 BOM</span>
            <div><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="料號、品名、BOM Rev" /></div>
          </label>
          <label className="bom-field">
            <span>BOM 狀態</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="">全部</option>
              <option value="Draft">草稿</option>
              <option value="PendingReview">審核中</option>
              <option value="Rejected">已退回</option>
              <option value="Released">已發布</option>
              <option value="Obsolete">已作廢</option>
              <option value="Archived">歷史</option>
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><RotateCcw size={16} aria-hidden="true" />套用</button>
        </div>

        <PdmWorkbenchList
          rows={filteredRows}
          getRowKey={(row) => row.id}
          ariaLabel="BOM 清單"
          className="bom-draft-strip"
          tableClassName="bom-workbench-list-table"
          rowDataAttribute="data-bom-workbench-row"
          rowAriaKeyShortcuts="Enter Space"
          loading={loading}
          loadingState={<div className="empty">正在載入 BOM 清單...</div>}
          emptyState={<div className="empty"><strong>目前沒有符合條件的 BOM</strong><p>請調整搜尋或建立新的 BOM。</p><Link className="secondary-button" href="/bom/create">建立 BOM</Link></div>}
          onRowKeyDown={(event, row) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            router.push(detailHref(row));
          }}
          onOpenRow={(row) => router.push(detailHref(row))}
          columns={[
            {
              key: "partNumber",
              header: "料號",
              dataLabel: "料號",
              className: "bom-workbench-col-part",
              render: (row) => <Link className="link-button pdm-identity-code" href={detailHref(row)}><SearchHighlight value={row.parent_part_number} query={query} /></Link>
            },
            {
              key: "name",
              header: "品名 / BOM",
              dataLabel: "品名 / BOM",
              className: "bom-workbench-col-name",
              render: (row) => <div><div className="pdm-identity-name"><SearchHighlight value={row.parent_part_name || "未填品名"} query={query} /></div><small className="pdm-identity-subline"><SearchHighlight value={row.draft_name} query={query} /></small></div>
            },
            {
              key: "revision",
              header: "BOM 定義",
              dataLabel: "BOM 定義",
              className: "bom-workbench-col-revision",
              render: (row) => <div className="pdm-meta-strip"><strong>BOM Rev {row.bom_revision ?? row.parent_revision}</strong><span className="pdm-meta-chip">{row.line_count} 項</span></div>
            },
            { key: "spacer", header: null, className: "bom-workbench-layout-spacer pdm-identity-layout-spacer", cellClassName: "bom-workbench-layout-spacer pdm-identity-layout-spacer", ariaHidden: true },
            {
              key: "status",
              header: "工作狀態",
              dataLabel: "工作狀態",
              className: "bom-workbench-col-status",
              render: (row) => <div className="pdm-meta-strip"><StatusBadge status={row.status} context="bomDraft" highlightQuery={query} />{row.is_active ? <span className="pdm-meta-chip">目前使用</span> : null}</div>
            }
          ]}
        />
      </section>
    </main>
  );
}

function detailHref(row: BomWorkbenchListRecord) {
  const parentPartNumberId = row.definitionId ? row.applicableParents?.[0]?.partNumberId : null;
  return parentPartNumberId
    ? `/bom/workbench/${encodeURIComponent(row.id)}?parentPartNumberId=${encodeURIComponent(parentPartNumberId)}`
    : `/bom/workbench/${encodeURIComponent(row.id)}`;
}
