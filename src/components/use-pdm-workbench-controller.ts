"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PdmWorkbenchListResponse } from "@/lib/pdm-workbench-contract";

export type PdmWorkbenchLocationState<QueryState> = {
  query: QueryState;
  detailKey: string | null;
  legacyDetail: string | null;
};

type UpdateQuery<QueryState> = QueryState | ((current: QueryState) => QueryState);

export type UsePdmWorkbenchControllerOptions<Row, Detail, QueryState, Filters> = {
  initialQuery: QueryState;
  initialLocation: () => PdmWorkbenchLocationState<QueryState>;
  readLocation: () => PdmWorkbenchLocationState<QueryState>;
  writeLocation: (state: PdmWorkbenchLocationState<QueryState>, mode: "replace" | "push") => void;
  buildListUrl: (query: QueryState, cursor: string | null) => string;
  buildDetailUrl: (rowKey: string) => string;
  getRowKey: (row: Row) => string;
  normalizeResponse: (value: unknown) => PdmWorkbenchListResponse<Row, Filters>;
  normalizeDetail: (value: unknown) => Detail;
  detailRowKey: (detail: Detail) => string;
  detailHistoryMode?: "replace" | "push";
  listErrorMessage?: string;
  detailErrorMessage?: string;
  invalidCursorMessage?: string;
  onUnauthorized?: () => void;
};

type ApiErrorBody = {
  error?: string | { code?: string; message?: string };
  message?: string;
};

function apiMessage(body: ApiErrorBody, fallback: string) {
  const errorMessage = typeof body.error === "object" ? body.error?.message : body.error;
  return body.message?.trim() || errorMessage?.trim() || fallback;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<unknown>;
}

export function usePdmWorkbenchController<Row, Detail, QueryState, Filters>({
  initialQuery,
  initialLocation,
  readLocation,
  writeLocation,
  buildListUrl,
  buildDetailUrl,
  getRowKey,
  normalizeResponse,
  normalizeDetail,
  detailRowKey,
  detailHistoryMode = "push",
  listErrorMessage = "工作清單目前無法載入，請重新整理。",
  detailErrorMessage = "這筆工作已不存在或目前無法查看。",
  invalidCursorMessage = "清單內容已更新，已回到第一頁。",
  onUnauthorized
}: UsePdmWorkbenchControllerOptions<Row, Detail, QueryState, Filters>) {
  const [initialized, setInitialized] = useState(false);
  const [query, setQueryState] = useState<QueryState>(initialQuery);
  const [rows, setRows] = useState<Row[]>([]);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const listAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const initialDetailRef = useRef<string | null>(null);
  const queryRef = useRef(initialQuery);
  const selectedKeyRef = useRef<string | null>(null);
  const reconcileSelectionAfterQueryRef = useRef(false);

  const currentCursor = cursorHistory[pageIndex] ?? null;

  const resetPagination = useCallback(() => {
    setCursorHistory([null]);
    setPageIndex(0);
    setNextCursor(null);
  }, []);

  const writeCurrentLocation = useCallback((nextQuery: QueryState, detailKey: string | null, mode: "replace" | "push") => {
    writeLocation({ query: nextQuery, detailKey, legacyDetail: null }, mode);
  }, [writeLocation]);

  const loadRows = useCallback(async () => {
    if (!initialized) return;
    const requestId = ++listRequestRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    setLoading(true);
    setError("");
    let response: Response;
    try {
      response = await fetch(buildListUrl(query, currentCursor), {
        cache: "no-store",
        signal: controller.signal
      });
    } catch (caught) {
      if (controller.signal.aborted || listRequestRef.current !== requestId) return;
      setLoading(false);
      setError(caught instanceof Error ? caught.message : listErrorMessage);
      return;
    }
    const raw = await readJson(response);
    if (listRequestRef.current !== requestId) return;
    setLoading(false);
    if (response.status === 401) {
      onUnauthorized?.();
      return;
    }
    if (!response.ok) {
      if (response.status === 400 && currentCursor) {
        resetPagination();
        setNotice(invalidCursorMessage);
        return;
      }
      setError(apiMessage(raw as ApiErrorBody, listErrorMessage));
      return;
    }
    const body = normalizeResponse(raw);
    setRows(body.rows);
    setNextCursor(body.nextCursor);
    setFilters(body.filters);
    if (reconcileSelectionAfterQueryRef.current) {
      reconcileSelectionAfterQueryRef.current = false;
      const currentSelection = selectedKeyRef.current;
      if (currentSelection && !body.rows.some((row) => getRowKey(row) === currentSelection)) {
        detailAbortRef.current?.abort();
        detailRequestRef.current += 1;
        setSelectedKey(null);
        setDetail(null);
        setDetailLoading(false);
        writeCurrentLocation(queryRef.current, null, "replace");
      }
    }
  }, [buildListUrl, currentCursor, getRowKey, initialized, invalidCursorMessage, listErrorMessage, normalizeResponse, onUnauthorized, query, resetPagination, writeCurrentLocation]);

  const setQuery = useCallback((update: UpdateQuery<QueryState>) => {
    const current = queryRef.current;
    const next = typeof update === "function" ? (update as (value: QueryState) => QueryState)(current) : update;
    queryRef.current = next;
    reconcileSelectionAfterQueryRef.current = true;
    setQueryState(next);
    writeCurrentLocation(next, selectedKey, "replace");
    resetPagination();
  }, [resetPagination, selectedKey, writeCurrentLocation]);

  const closeDetail = useCallback((mode: "replace" | "push" = detailHistoryMode) => {
    detailAbortRef.current?.abort();
    detailRequestRef.current += 1;
    setSelectedKey(null);
    setDetail(null);
    setDetailLoading(false);
    writeCurrentLocation(queryRef.current, null, mode);
  }, [detailHistoryMode, writeCurrentLocation]);

  const openDetail = useCallback(async (rowKey: string, mode: "replace" | "push" = detailHistoryMode) => {
    const requestId = ++detailRequestRef.current;
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    setSelectedKey(rowKey);
    setDetailLoading(true);
    setError("");
    let response: Response;
    try {
      response = await fetch(buildDetailUrl(rowKey), { cache: "no-store", signal: controller.signal });
    } catch (caught) {
      if (controller.signal.aborted || detailRequestRef.current !== requestId) return null;
      setDetailLoading(false);
      setError(caught instanceof Error ? caught.message : detailErrorMessage);
      return null;
    }
    const raw = await readJson(response);
    if (detailRequestRef.current !== requestId) return null;
    setDetailLoading(false);
    if (response.status === 401) {
      onUnauthorized?.();
      return null;
    }
    if (!response.ok) {
      setDetail(null);
      setError(apiMessage(raw as ApiErrorBody, detailErrorMessage));
      if (response.status === 404) {
        setSelectedKey(null);
        writeCurrentLocation(queryRef.current, null, "replace");
      }
      return null;
    }
    const body = normalizeDetail(raw);
    const canonicalKey = detailRowKey(body);
    setSelectedKey(canonicalKey);
    setDetail(body);
    setRows((current) => current.map((row) => getRowKey(row) === canonicalKey
      ? ((body as { row?: Row }).row ?? row)
      : row));
    writeCurrentLocation(queryRef.current, canonicalKey, mode);
    return body;
  }, [buildDetailUrl, detailErrorMessage, detailHistoryMode, detailRowKey, getRowKey, normalizeDetail, onUnauthorized, writeCurrentLocation]);

  const goNext = useCallback(() => {
    if (!nextCursor) return;
    setCursorHistory((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((current) => current + 1);
  }, [nextCursor, pageIndex]);

  const goPrevious = useCallback(() => {
    setPageIndex((current) => Math.max(0, current - 1));
  }, []);

  const refresh = useCallback(async () => {
    const key = selectedKey;
    await Promise.all([
      loadRows(),
      key ? openDetail(key, "replace") : Promise.resolve(null)
    ]);
  }, [loadRows, openDetail, selectedKey]);

  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  useEffect(() => {
    const location = initialLocation();
    queryRef.current = location.query;
    setQueryState(location.query);
    setSelectedKey(location.detailKey);
    initialDetailRef.current = location.detailKey;
    setInitialized(true);
  }, [initialLocation]);

  useEffect(() => {
    if (!initialized) return;
    void loadRows();
    return () => listAbortRef.current?.abort();
  }, [initialized, loadRows]);

  useEffect(() => {
    if (!initialized || !initialDetailRef.current) return;
    const key = initialDetailRef.current;
    initialDetailRef.current = null;
    void openDetail(key, "replace");
  }, [initialized, openDetail]);

  useEffect(() => {
    if (!initialized) return;
    const onPopState = () => {
      const location = readLocation();
      queryRef.current = location.query;
      setQueryState(location.query);
      resetPagination();
      if (location.detailKey) void openDetail(location.detailKey, "replace");
      else {
        detailAbortRef.current?.abort();
        detailRequestRef.current += 1;
        setSelectedKey(null);
        setDetail(null);
        setDetailLoading(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [initialized, openDetail, readLocation, resetPagination]);

  useEffect(() => () => {
    listAbortRef.current?.abort();
    detailAbortRef.current?.abort();
  }, []);

  return {
    initialized,
    rows,
    setRows,
    filters,
    loading,
    detailLoading,
    error,
    setError,
    notice,
    setNotice,
    query,
    setQuery,
    selectedKey,
    setSelectedKey,
    detail,
    setDetail,
    nextCursor,
    pageIndex,
    resetPagination,
    loadFirstPage: resetPagination,
    loadRows,
    refresh,
    goNext,
    goPrevious,
    openDetail,
    closeDetail
  };
}
