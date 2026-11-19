"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, UploadCloud } from "lucide-react";
import { droppedDrawingFiles, selectedDrawingFiles, type DrawingUploadFile } from "@/lib/drawing-upload-files";
import { prepareDrawingUpload, type PreparedDrawingUpload } from "@/lib/drawing-upload-archive";
import { uploadAssemblyPackage } from "@/lib/assembly-package-upload-client";
import { pdmPermissionFetch } from "@/lib/pdm-permission-client";
import styles from "./drawing-workspace-upload.module.css";

type Props = { base: string; code: string; compact: boolean; disabled?: boolean; activePackageId: string | null; downloadHref: string | null; archiveName?: string;
  onBegin: () => Promise<void>; onComplete: () => Promise<void>; onUploadFile: (file: File, key: string) => Promise<void>; onPendingChange: (pending: boolean) => void; onPackageBusy: (busy: boolean) => void };
type Plan = PreparedDrawingUpload & { id: string; activePackageId: string | null };
type Task = { id: string; label: string; state: "uploading" | "done" | "failed"; progress?: number; error?: string };
function suggested(choices: DrawingUploadFile[], code: string, archive: File | null) {
  if (choices.length === 1) return choices[0].path;
  const names = [code, code.split("-")[0], archive?.name.replace(/\.zip$/iu, "")].filter(Boolean).map(value => value!.toUpperCase());
  const matches = choices.filter(item => names.includes(item.path.split("/").at(-1)!.replace(/\.[^.]+$/u, "").toUpperCase()));
  return matches.length === 1 ? matches[0].path : "";
}
export function DrawingWorkspaceUpload(props: Props) {
  const input = useRef<HTMLInputElement>(null), directory = useRef<HTMLInputElement>(null);
  const callbacks = useRef(props); useEffect(() => { callbacks.current = props; }, [props]);
  const pending = useRef(false), started = useRef<Plan | null>(null), completed = useRef(new Set<string>());
  const [menu, setMenu] = useState(false), [over, setOver] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [preparing, setPreparing] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null), [drawing, setDrawing] = useState(""), [part, setPart] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function accept(files: DrawingUploadFile[] | Promise<DrawingUploadFile[]>) {
    if (props.disabled || pending.current) return;
    pending.current = true; setBusy(true); setError(""); setTasks([]); setPlan(null); started.current = null; completed.current.clear();
    callbacks.current.onPendingChange(true); setPreparing("正在整理檔案…"); setMenu(false);
    try {
      const selected = await files;
      if (!selected.length) { callbacks.current.onPendingChange(false); return; }
      let existingArchive: File | undefined;
      if (props.downloadHref && !selected.some(item => /\.zip$/iu.test(item.path))) {
        const response = await pdmPermissionFetch(props.downloadHref, { cache: "no-store" });
        if (!response.ok) throw new Error("無法讀取本版組立包，請確認下載權限後重試。");
        existingArchive = new File([await response.blob()], props.archiveName || "assembly.zip");
      }
      const prepared = await prepareDrawingUpload(selected, { code: props.code, existingArchive });
      if (!mounted.current) return;
      setDrawing(suggested(prepared.drawingChoices, props.code, prepared.archive)); setPart(suggested(prepared.partChoices, props.code, prepared.archive));
      setPlan({ ...prepared, id: crypto.randomUUID(), activePackageId: props.activePackageId });
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "無法整理檔案，請重新選擇。"); }
    finally { pending.current = false; if (mounted.current) { setBusy(false); setPreparing(""); } }
  }
  async function run(current: Plan, selectedDrawing: string, selectedPart: string) {
    if (props.disabled || pending.current) return;
    pending.current = true; setBusy(true); setError(""); callbacks.current.onPackageBusy(true);
    const list = [...current.files, ...current.drawingChoices.filter(item => item.path === selectedDrawing), ...current.partChoices.filter(item => item.path === selectedPart)];
    let begun = false, failed = false;
    const update = (task: Task) => { if (mounted.current) setTasks(rows => [...rows.filter(row => row.id !== task.id), task]); };
    try {
      await callbacks.current.onBegin(); begun = true;
      if (current.archive && !completed.current.has(current.id)) {
        const task = { id: current.id, label: `組立檔案 · ${current.fileCount} 個檔案`, state: "uploading" as const };
        update(task);
        try {
          await uploadAssemblyPackage(props.base, current.archive, current.activePackageId, { idempotencyKey: current.id,
            onProgress: bytes => update({ ...task, progress: Math.floor(100 * bytes / current.archive!.size) }) });
          completed.current.add(task.id); update({ ...task, state: "done", progress: 100 });
        } catch (reason) { update({ ...task, state: "failed", error: reason instanceof Error ? reason.message : "上傳失敗" }); throw reason; }
      }
      for (const item of list) {
        const id = current.id + ":" + item.path;
        if (completed.current.has(id)) continue;
        const task = { id, label: item.path, state: "uploading" as const }; update(task);
        try { await callbacks.current.onUploadFile(item.file, id); completed.current.add(id); update({ ...task, state: "done" }); }
        catch (reason) { failed = true; update({ ...task, state: "failed", error: reason instanceof Error ? reason.message : "上傳失敗" }); }
      }
      if (!failed) { setPlan(null); setTasks([]); callbacks.current.onPendingChange(false); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "上傳未完成，請重試。"); }
    finally {
      try { if (begun) await callbacks.current.onComplete(); }
      catch { if (mounted.current) setError("檔案已上傳，但無法更新畫面，請重新載入。"); }
      finally { callbacks.current.onPackageBusy(false); pending.current = false; if (mounted.current) setBusy(false); }
    }
  }
  useEffect(() => {
    if (!plan || props.disabled || busy || started.current === plan || (plan.drawingChoices.length && !drawing) || (plan.partChoices.length && !part)) return;
    started.current = plan; void run(plan, drawing, part);
  });
  const blocked = props.disabled || busy;
  return <div className={`${styles.control} ${props.compact ? styles.compact : ""} ${over ? styles.over : ""}`}
    onKeyDown={event => { if (event.key === "Escape") setMenu(false); }}
    onDragOver={event => { event.preventDefault(); if (!blocked) setOver(true); }} onDragLeave={() => setOver(false)}
    onDrop={event => { event.preventDefault(); setOver(false); if (!blocked) void accept(droppedDrawingFiles(event.dataTransfer)); }}>
    <div className={styles.entry}>
      <button type="button" className={styles.drop} disabled={blocked} onClick={() => input.current?.click()}>
        {props.compact ? <Plus size={16} aria-hidden="true" /> : <UploadCloud size={24} aria-hidden="true" />}
        <span>{props.compact ? "加入檔案" : "拖入檔案或資料夾，或點此選取"}{!props.compact && <small>ZIP／CAD／PDF</small>}</span>
      </button>
      <button type="button" className={styles.more} disabled={blocked} aria-label="其他選檔方式" aria-expanded={menu} onClick={() => setMenu(!menu)}><ChevronDown size={15} /></button>
    </div>
    {menu && <div className={styles.menu}><button type="button" onClick={() => { setMenu(false); directory.current?.click(); }}>選擇資料夾</button></div>}
    <input ref={input} type="file" hidden multiple aria-label="加入本版檔案" onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (files.length) void accept(Promise.resolve().then(() => selectedDrawingFiles(files))); }} />
    <input ref={directory} type="file" hidden multiple {...{ webkitdirectory: "" }} aria-label="加入整個資料夾" onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (files.length) void accept(Promise.resolve().then(() => selectedDrawingFiles(files))); }} />
    {preparing && <p role="status">{preparing}</p>}
    {plan && !busy && !tasks.length && !error && <div className={styles.choices}>
      {plan.drawingChoices.length > 1 && <label>選擇 2D 主檔<select value={drawing} onChange={event => setDrawing(event.target.value)}><option value="">請選擇</option>{plan.drawingChoices.map(item => <option key={item.path} value={item.path}>{item.path}</option>)}</select></label>}
      {plan.partChoices.length > 1 && <label>選擇 3D 主檔<select value={part} onChange={event => setPart(event.target.value)}><option value="">請選擇</option>{plan.partChoices.map(item => <option key={item.path} value={item.path}>{item.path}</option>)}</select></label>}
    </div>}
    {tasks.length > 0 && <ul className={styles.progress} aria-label="檔案上傳進度">{tasks.map(task => <li key={task.id}><span>{task.label}</span><span>{task.state === "done" ? "已完成" : task.state === "failed" ? task.error : task.progress === undefined ? "傳輸中…" : `傳輸中 ${task.progress}%`}</span></li>)}</ul>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!busy && plan && (error || tasks.some(task => task.state === "failed")) && <button type="button" className="secondary-button" onClick={() => void run(plan, drawing, part)}>重試未完成項目</button>}
    {!busy && (error || plan) && <div className={styles.actions}><button type="button" className="ghost-button" onClick={() => { setPlan(null); setTasks([]); setError(""); callbacks.current.onPendingChange(false); }}>關閉</button></div>}
  </div>;
}
