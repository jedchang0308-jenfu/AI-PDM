"use client";

import { useEffect, useId, useState } from "react";
import { CanonicalNumberingCreateAction } from "@/components/canonical-numbering-create-action";

type SearchResult = { entityType: "part_root" | "part_number" | "drawing_number"; entityId: string; rootCode: string; displayCode: string; displayName: string; recordStatus: string };

export default function NumberingSearchPage() {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setQuery(new URL(window.location.href).searchParams.get("query") ?? "");
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!query.trim()) { setResults([]); return; }
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/numbering/search?query=${encodeURIComponent(query.trim())}&limit=50`, { cache: "no-store" });
        const body = await response.json() as { results?: SearchResult[]; error?: { message?: string } };
        if (!response.ok) setError(body.error?.message ?? "搜尋失敗");
        else setResults(body.results ?? []);
      } catch { setError("搜尋失敗"); }
      finally { setLoading(false); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);
  return <main className="canonical-workbench numbering-identity-search">
    <header className="canonical-workbench-header"><h1>編號搜尋</h1><div className="canonical-workbench-header-actions"><CanonicalNumberingCreateAction surface="search" /></div></header>
    <section className="canonical-toolbar" aria-label="編號搜尋"><label className="canonical-search" htmlFor={inputId}><span>搜尋圖號、料號或圖料根號</span><input id={inputId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入編號" /></label></section>
    {loading ? <p role="status">搜尋中…</p> : null}
    {error ? <p className="canonical-error" role="alert">{error}</p> : null}
    <section className="canonical-list" aria-label="搜尋結果"><table><thead><tr><th>編號</th><th>品名</th><th>圖料根號</th><th>資料狀態</th></tr></thead><tbody>
      {!loading && !results.length && query.trim() ? <tr><td colSpan={4} className="canonical-empty">沒有符合條件的編號</td></tr> : null}
      {results.map((result) => <tr key={`${result.entityType}:${result.entityId}`}><td><a href={result.entityType === "part_number" ? `/parts?query=${encodeURIComponent(result.displayCode)}` : `/numbering/drawings?query=${encodeURIComponent(result.displayCode)}`}>{result.displayCode}</a></td><td>{result.displayName || "—"}</td><td>{result.rootCode}</td><td>{result.recordStatus}</td></tr>)}
    </tbody></table></section>
  </main>;
}
