"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Edit3, FileText, RefreshCcw, Save, ShieldCheck, X } from "lucide-react";

type PolicyResponse = {
  content: string;
  sourcePath: string;
  canEdit: boolean;
  userRole: string;
  updatedAt: string | null;
};

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] };

export default function PolicyPage() {
  const [policy, setPolicy] = useState<PolicyResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const dirty = policy ? draft !== policy.content : false;
  const updatedAtLabel = useMemo(() => {
    if (!policy?.updatedAt) return "尚無更新時間";
    return new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(policy.updatedAt));
  }, [policy?.updatedAt]);
  const documentVersionLabel = useMemo(() => {
    const status = policy?.content.match(/^狀態[:：]\s*(.+)$/m)?.[1]?.trim();
    const version = policy?.content.match(/^版本[:：]\s*(.+)$/m)?.[1]?.trim();
    return [status, version].filter(Boolean).join(" / ") || "PDM 使用者管理辦法";
  }, [policy?.content]);

  useEffect(() => {
    loadPolicy().catch(console.error);
  }, []);

  async function loadPolicy() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/policy/management", { cache: "no-store" });
      if (response.status === 401) {
        setPolicy(null);
        setError("請先登入，再查看 PDM 管理辦法。");
        return;
      }
      const body = (await response.json()) as Partial<PolicyResponse> & { message?: string };
      if (!response.ok || !body.content) {
        throw new Error(body.message ?? "管理辦法讀取失敗。");
      }
      const nextPolicy = body as PolicyResponse;
      setPolicy(nextPolicy);
      setDraft(nextPolicy.content);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "管理辦法讀取失敗。");
    } finally {
      setLoading(false);
    }
  }

  async function savePolicy() {
    if (!policy?.canEdit || saving || !dirty) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/policy/management", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft })
      });
      const body = (await response.json()) as Partial<PolicyResponse> & { message?: string };
      if (!response.ok || !body.content) {
        throw new Error(body.message ?? "管理辦法未儲存。");
      }
      const nextPolicy = body as PolicyResponse;
      setPolicy(nextPolicy);
      setDraft(nextPolicy.content);
      setEditing(false);
      setMessage("已儲存管理辦法。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "管理辦法未儲存。");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (!policy) return;
    setDraft(policy.content);
    setEditing(false);
    setError("");
    setMessage("");
  }

  return (
    <section className="policy-page" aria-label="PDM 管理辦法">
      <div className="topbar">
        <div>
          <h1>PDM 管理辦法</h1>
          <p>查閱各角色在新產品開發、版次、技術移轉與設計變更中的作業規則。</p>
        </div>
        <div className="actions">
          <button className="secondary-button" type="button" onClick={() => loadPolicy().catch(console.error)} disabled={loading || saving} title="重新整理">
            <RefreshCcw size={16} aria-hidden="true" />
            重新整理
          </button>
          {policy?.canEdit && !editing ? (
            <button className="primary-button" type="button" onClick={() => setEditing(true)} title="編輯管理辦法">
              <Edit3 size={16} aria-hidden="true" />
              編輯
            </button>
          ) : null}
          {editing ? (
            <>
              <button className="secondary-button" type="button" onClick={cancelEdit} disabled={saving} title="取消編輯">
                <X size={16} aria-hidden="true" />
                取消
              </button>
              <button className="primary-button" type="button" onClick={savePolicy} disabled={saving || !dirty} title="儲存管理辦法">
                <Save size={16} aria-hidden="true" />
                {saving ? "儲存中" : "儲存"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="policy-message error" role="alert">
          <strong>{error}</strong>
          {error.includes("登入") ? <Link href="/login">前往登入</Link> : null}
        </div>
      ) : null}
      {message ? (
        <div className="policy-message success" role="status">
          {message}
        </div>
      ) : null}

      <section className="policy-page-grid">
        <aside className="panel policy-meta-panel" aria-label="管理辦法狀態">
          <div className="panel-header">
            <div>
              <h2>文件資訊</h2>
              <p>目前版本、權限與更新時間。</p>
            </div>
            <FileText size={18} aria-hidden="true" />
          </div>
          <div className="policy-meta-list">
            <div>
              <span>文件版本</span>
              <strong>{documentVersionLabel}</strong>
            </div>
            <div>
              <span>更新時間</span>
              <strong>{updatedAtLabel}</strong>
            </div>
            <div>
              <span>目前權限</span>
              <strong>{policy?.canEdit ? "Admin 可編輯" : "唯讀"}</strong>
            </div>
            <div className="policy-permission-note">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>{policy?.canEdit ? "你可以編輯並儲存管理辦法。" : "只有系統管理員可以編輯管理辦法。"}</span>
            </div>
          </div>
        </aside>

        <section className="panel policy-content-panel" aria-label="管理辦法內容">
          <div className="panel-header">
            <div>
              <h2>{editing ? "編輯管理辦法" : "管理辦法內容"}</h2>
              <p>{editing ? "儲存後會更新所有使用者看到的管理辦法。" : "小版次用於研發或設計變更作業，大版次才是已發布資料。"}</p>
            </div>
            {policy?.userRole ? <span className="metadata-badge">目前角色 {policy.userRole}</span> : null}
          </div>

          {loading ? (
            <div className="policy-loading">正在讀取管理辦法。</div>
          ) : editing ? (
            <div className="policy-editor">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label="管理辦法 Markdown 編輯區"
                spellCheck={false}
              />
              <div className="policy-editor-footer">
                <span>{dirty ? "有尚未儲存的變更" : "目前內容已同步"}</span>
                <span>{draft.length.toLocaleString("zh-TW")} 字元</span>
              </div>
            </div>
          ) : (
            <PolicyMarkdown content={policy?.content ?? ""} />
          )}
        </section>
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
