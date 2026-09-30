"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";

type PolicyResponse = {
  content: string;
  sourcePath: string;
  updatedAt: string | null;
};

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] };

export default function PolicyPage() {
  const [policy, setPolicy] = useState<PolicyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/policy/management", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) throw new Error("請先登入，再查看 PDM 管理辦法。");
        const body = await response.json();
        if (!response.ok || typeof body.content !== "string") {
          throw new Error("管理辦法讀取失敗。");
        }
        setPolicy(body as PolicyResponse);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "管理辦法讀取失敗。");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const updatedAtLabel = policy?.updatedAt
    ? new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(policy.updatedAt))
    : "尚無更新時間";

  return (
    <section className="policy-page" aria-label="PDM 管理辦法">
      <div className="topbar">
        <div>
          <h1>PDM 管理辦法</h1>
          <p>查閱各角色在新產品開發、版次、技術移轉與設計變更中的作業規則。</p>
        </div>
        <div className="actions">
          {policy ? <span className="metadata-badge"><FileText size={16} aria-hidden="true" /> 版本化文件 · {updatedAtLabel}</span> : null}
        </div>
      </div>
      {error ? (
        <div className="policy-message error" role="alert">
          <strong>{error}</strong>
          {error.includes("登入") ? <Link href="/login">前往登入</Link> : null}
        </div>
      ) : null}
      <section className="panel policy-content-panel" aria-label="管理辦法內容">
        <div className="panel-header">
          <div>
            <h2>管理辦法內容</h2>
            <p>內容隨正式版本發布，供各角色查閱。</p>
          </div>
        </div>
        {loading ? <div className="policy-loading">正在讀取管理辦法。</div> : null}
        {!loading && policy ? <PolicyMarkdown content={policy.content} /> : null}
      </section>
    </section>
  );
}

function PolicyMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <article className="policy-document">
      {blocks.map((block, index) => {
        if (block.type === "heading") return <PolicyHeading block={block} key={`heading-${index}`} />;
        if (block.type === "list") return <PolicyList block={block} key={`list-${index}`} />;
        if (block.type === "table") return <PolicyTable rows={block.rows} key={`table-${index}`} />;
        return (
          <p key={`paragraph-${index}`}>
            {block.lines.map((line, lineIndex) => (
              <span key={`${line}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </article>
  );
}

function PolicyHeading({ block }: { block: Extract<MarkdownBlock, { type: "heading" }> }) {
  const content = renderInline(block.text);
  if (block.level <= 1) return <h1>{content}</h1>;
  if (block.level === 2) return <h2>{content}</h2>;
  if (block.level === 3) return <h3>{content}</h3>;
  return <h4>{content}</h4>;
}

function PolicyList({ block }: { block: Extract<MarkdownBlock, { type: "list" }> }) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag>
      {block.items.map((item, index) => (
        <li key={`${item}-${index}`}>{renderInline(item)}</li>
      ))}
    </Tag>
  );
}

function PolicyTable({ rows }: { rows: string[][] }) {
  const separatorIndex = rows.findIndex((row) => row.every((cell) => /^:?-{3,}:?$/.test(cell)));
  const header = rows[0] ?? [];
  const bodyRows = separatorIndex === 1 ? rows.slice(2) : rows.slice(1);

  return (
    <div className="policy-table-wrap">
      <table className="policy-table">
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th key={`${cell}-${index}`}>{renderInline(cell)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`}>{renderInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseMarkdown(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "table", rows: tableLines.map(parseTableRow).filter((row) => row.length > 0) });
      continue;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const items: string[] = [];
      const orderedList = Boolean(ordered);
      while (index < lines.length) {
        const match = orderedList ? lines[index].match(/^\s*\d+\.\s+(.+)$/) : lines[index].match(/^\s*[-*]\s+(.+)$/);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: "list", ordered: orderedList, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const nextLine = lines[index];
      if (nextLine.match(/^(#{1,6})\s+(.+)$/) || nextLine.trim().startsWith("|") || nextLine.match(/^\s*[-*]\s+(.+)$/) || nextLine.match(/^\s*\d+\.\s+(.+)$/)) {
        break;
      }
      paragraphLines.push(nextLine.trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function parseTableRow(line: string) {
  const cells = line.trim().split("|");
  if (cells[0] === "") cells.shift();
  if (cells[cells.length - 1] === "") cells.pop();
  return cells.map((cell) => cell.trim());
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
