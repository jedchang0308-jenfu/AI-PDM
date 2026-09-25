"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ReasonActionDialog } from "@/components/reason-action-dialog";

type Account = {
  id: string;
  principalId: string;
  employeeId: string;
  accountType: "human_personal" | "human_privileged";
  displayName: string;
  email: string | null;
  companyName: string;
  accountStatus: "active" | "suspended" | "expired" | "offboarded";
  lifecycleVersion: number;
};

type PrincipalCandidate = {
  principalId: string;
  employeeId: string;
  accountType: Account["accountType"];
  identityIssuer: string;
  identitySubject: string;
  mappingVersion: number;
  publishedAt: string;
};

type ProvisionReceipt = {
  operationId: string;
  principalId: string;
  pdmUserId: string;
  replayed: boolean;
  current: { accountStatus: Account["accountStatus"] };
};
type PendingProvision = { operationId: string; principalRef: PrincipalCandidate;
  displayName: string; contactEmail: string; accountEnabled: boolean };

type LifecycleAction = "suspend" | "reactivate" | "offboard" | "return_to_work";
type LifecycleIntent = { account: Pick<Account, "id">; action: LifecycleAction; title: string;
  operationId: string | null; reason: string | null };
type PendingLifecycle = { pdmUserId: string; action: LifecycleAction; operationId: string; reason: string };

const pendingLifecycleKey = "aipdm:principal-lifecycle-pending.v1";
const pendingProvisionKey = "aipdm:principal-provision-pending.v1";
const lifecycleTitles: Record<LifecycleAction, string> = {
  suspend: "暫停帳號", reactivate: "恢復帳號", offboard: "辦理離職", return_to_work: "復職帳號"
};

const statusText: Record<Account["accountStatus"], string> = {
  active: "可使用", suspended: "已暫停", expired: "已到期", offboarded: "已離職"
};

function responseError(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return `${fallback}（${body.error}）`;
  }
  return fallback;
}

function isPendingProvision(value: unknown): value is PendingProvision {
  if (!value || typeof value !== "object") return false;
  const pending = value as Partial<PendingProvision>;
  const candidate = pending.principalRef;
  return typeof pending.operationId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(pending.operationId) &&
    Boolean(candidate && typeof candidate.principalId === "string" &&
      candidate.principalId.length > 0 && candidate.principalId.length <= 255 &&
      typeof candidate.employeeId === "string" && candidate.employeeId.length > 0 &&
      ["human_personal", "human_privileged"].includes(candidate.accountType) &&
      typeof candidate.identityIssuer === "string" && candidate.identityIssuer.length > 0 &&
      typeof candidate.identitySubject === "string" && candidate.identitySubject.length > 0 &&
      Number.isSafeInteger(candidate.mappingVersion) && candidate.mappingVersion > 0 &&
      typeof candidate.publishedAt === "string" && Number.isFinite(Date.parse(candidate.publishedAt))) &&
    typeof pending.displayName === "string" && pending.displayName.length > 0 &&
    pending.displayName.length <= 255 && typeof pending.contactEmail === "string" &&
    pending.contactEmail.length <= 254 && typeof pending.accountEnabled === "boolean";
}

export function PrincipalAccountsPanel() {
  const [tab, setTab] = useState<"accounts" | "create">("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [principalId, setPrincipalId] = useState("");
  const [candidates, setCandidates] = useState<PrincipalCandidate[]>([]);
  const [selected, setSelected] = useState<PrincipalCandidate | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [accountEnabled, setAccountEnabled] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<ProvisionReceipt | null>(null);
  const [pendingProvision, setPendingProvision] = useState<PendingProvision | null>(null);
  const [lifecycleIntent, setLifecycleIntent] = useState<LifecycleIntent | null>(null);
  const [lifecycleMessage, setLifecycleMessage] = useState("");
  const [pendingLifecycle, setPendingLifecycle] = useState<PendingLifecycle | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(pendingProvisionKey);
      if (raw) {
        const pending: unknown = JSON.parse(raw);
        if (isPendingProvision(pending)) {
          const restored = pending;
          setPendingProvision(restored);
          setOperationId(restored.operationId);
          setPrincipalId(restored.principalRef.principalId);
          setCandidates([restored.principalRef]);
          setSelected(restored.principalRef);
          setDisplayName(restored.displayName);
          setContactEmail(restored.contactEmail);
          setAccountEnabled(restored.accountEnabled);
          setTab("create");
        } else sessionStorage.removeItem(pendingProvisionKey);
      }
    } catch { /* A reload cannot make a forged principal reference authoritative. */ }
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(pendingLifecycleKey);
      if (!raw) return;
      const pending: unknown = JSON.parse(raw);
      if (pending && typeof pending === "object" &&
          "pdmUserId" in pending && typeof pending.pdmUserId === "string" &&
          "action" in pending && typeof pending.action === "string" &&
          Object.hasOwn(lifecycleTitles, pending.action) &&
          "operationId" in pending && typeof pending.operationId === "string" &&
          "reason" in pending && typeof pending.reason === "string") {
        setPendingLifecycle(pending as PendingLifecycle);
      } else sessionStorage.removeItem(pendingLifecycleKey);
    } catch { /* Storage is advisory; the owner command remains replay-safe. */ }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/accounts", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.subjectMode !== "principal" || !Array.isArray(body.accounts)) {
        throw new Error(responseError(body, "帳號列表讀取失敗"));
      }
      if (active) { setAccounts(body.accounts); setListError(""); }
    }).catch((error) => {
      if (active) {
        setAccounts([]);
        setListError(error instanceof Error ? error.message : "帳號列表讀取失敗");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  async function findCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingProvision) return;
    setBusy(true);
    setMessage("");
    setReceipt(null);
    setSelected(null);
    setCandidates([]);
    setOperationId(null);
    try {
      const response = await fetch(`/api/admin/accounts?view=principal-candidate&principalId=${encodeURIComponent(principalId.trim())}`,
        { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.candidates)) {
        throw new Error(responseError(body, "已發布身分查詢失敗"));
      }
      setCandidates(body.candidates);
      if (body.candidates.length === 0) setMessage("找不到這個 principal 的有效已發布身分。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "已發布身分查詢失敗");
    } finally { setBusy(false); }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    setReceipt(null);
    const id = operationId ?? crypto.randomUUID();
    setOperationId(id);
    const pending = { operationId: id, principalRef: selected,
      displayName: displayName.trim(), contactEmail: contactEmail.trim(), accountEnabled };
    setPendingProvision(pending);
    try { sessionStorage.setItem(pendingProvisionKey, JSON.stringify(pending)); }
    catch { /* In-memory retry still preserves the operation while this page is open. */ }
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contractVersion: "ai-pdm.principal-provision.v1",
          operationId: id, principalRef: selected, displayName: displayName.trim(),
          contactEmail: contactEmail.trim() || null, accountEnabled })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.operationId !== id || body.principalId !== selected.principalId ||
          typeof body.pdmUserId !== "string") {
        throw new Error(responseError(body, "帳號建立未取得可核對的結果；請以同一操作重試"));
      }
      setReceipt(body);
      setPendingProvision(null);
      try { sessionStorage.removeItem(pendingProvisionKey); } catch { /* No persisted operation. */ }
      setMessage(body.replayed ? "已核對原操作結果，沒有重複建立帳號。" : "應用帳號已建立。");
      setLoading(true);
      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "帳號建立失敗；請以同一操作重試");
    } finally { setBusy(false); }
  }

  function invalidateOperation() {
    if (pendingProvision) return;
    setOperationId(null);
    setReceipt(null);
    setMessage("");
  }

  async function updateLifecycle(reason: string) {
    if (!lifecycleIntent || busy) return;
    if (lifecycleIntent.reason !== null && lifecycleIntent.reason !== reason) {
      setLifecycleMessage("同一操作重試須保留原原因；請重新輸入原原因。仍可取消後重新整理結果。");
      return;
    }
    const operationId = lifecycleIntent.operationId ?? crypto.randomUUID();
    const pending = { pdmUserId: lifecycleIntent.account.id,
      action: lifecycleIntent.action, operationId, reason };
    setLifecycleIntent({ ...lifecycleIntent, operationId, reason });
    setPendingLifecycle(pending);
    try { sessionStorage.setItem(pendingLifecycleKey, JSON.stringify(pending)); }
    catch { /* In-memory retry still preserves the operation while this page is open. */ }
    setBusy(true);
    setLifecycleMessage("");
    try {
      const response = await fetch(`/api/admin/accounts/${encodeURIComponent(lifecycleIntent.account.id)}/lifecycle`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId, action: lifecycleIntent.action, reason })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.subjectMode !== "principal" ||
          body.account?.operationId !== operationId ||
          body.account?.pdmUserId !== lifecycleIntent.account.id) {
        throw new Error(responseError(body, "帳號異動未取得可核對的結果；請以同一操作重試"));
      }
      setLifecycleMessage(body.account.replayed ? "已核對原操作結果。" : "帳號狀態已更新，既有登入已失效。");
      setLifecycleIntent(null);
      setPendingLifecycle(null);
      try { sessionStorage.removeItem(pendingLifecycleKey); } catch { /* No persisted operation. */ }
      setLoading(true);
      setRefresh((value) => value + 1);
    } catch (error) {
      setLifecycleMessage(error instanceof Error ? error.message : "帳號異動失敗；請以同一操作重試");
    } finally { setBusy(false); }
  }

  function beginLifecycle(account: Account, action: LifecycleAction, title: string) {
    if (pendingLifecycle &&
        (pendingLifecycle.pdmUserId !== account.id || pendingLifecycle.action !== action)) {
      setLifecycleMessage("前一筆帳號異動結果尚未核對；請先重試該筆操作。");
      return;
    }
    setLifecycleMessage("");
    setLifecycleIntent({ account, action, title,
      operationId: pendingLifecycle?.operationId ?? null,
      reason: pendingLifecycle?.reason ?? null });
  }

  return <div className="account-console-page">
    <header className="page-header"><div>
      <h1>帳號與權限</h1>
      <p>應用帳號以已發布的 principal 建立；角色與權限由正式治理來源決定。</p>
    </div></header>
    <div className="account-console-tabs" role="tablist" aria-label="principal 帳號管理分頁">
      <button type="button" role="tab" aria-selected={tab === "accounts"}
        className={tab === "accounts" ? "primary-button" : "secondary-button"}
        onClick={() => setTab("accounts")}>帳號管理</button>
      <button type="button" role="tab" aria-selected={tab === "create"}
        className={tab === "create" ? "primary-button" : "secondary-button"}
        onClick={() => setTab("create")}>新增應用帳號</button>
    </div>
    {tab === "accounts" ? <section className="panel account-management-panel">
      <div className="panel-header"><h2>應用帳號</h2>
        <button type="button" className="secondary-button" disabled={loading}
          onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>重新整理</button>
      </div>
      {listError ? <p role="alert">{listError}</p> : null}
      {lifecycleMessage ? <p role={lifecycleIntent ? "alert" : "status"}>{lifecycleMessage}</p> : null}
      {pendingLifecycle ? <p role="status">有一筆未確認的帳號異動（{pendingLifecycle.pdmUserId}）。
        <button type="button" className="secondary-button" disabled={busy}
          onClick={() => setLifecycleIntent({ account: { id: pendingLifecycle.pdmUserId },
            action: pendingLifecycle.action, title: lifecycleTitles[pendingLifecycle.action],
            operationId: pendingLifecycle.operationId, reason: pendingLifecycle.reason })}>
          以原操作核對結果
        </button>
      </p> : null}
      {loading ? <p role="status">正在讀取帳號...</p> :
        accounts.length === 0 ? <p>目前沒有已啟用 principal 架構的應用帳號。</p> :
          <div className="table-wrap"><table className="account-management-table">
            <thead><tr><th>姓名</th><th>principal</th><th>員工</th><th>狀態</th><th>工作區</th><th>操作</th></tr></thead>
            <tbody>{accounts.map((account) => <tr key={account.principalId}>
              <td><strong>{account.displayName}</strong><small>{account.email ?? account.id}</small></td>
              <td>{account.principalId}</td><td>{account.employeeId}</td>
              <td>{statusText[account.accountStatus]}</td><td>{account.companyName}</td>
              <td>
                {account.accountStatus === "active" ? <button type="button" className="secondary-button"
                  disabled={busy} onClick={() => beginLifecycle(account, "suspend", "暫停帳號")}>暫停</button> : null}
                {["suspended", "expired"].includes(account.accountStatus) ? <button type="button"
                  className="secondary-button" disabled={busy}
                  onClick={() => beginLifecycle(account, "reactivate", "恢復帳號")}>恢復</button> : null}
                {account.accountStatus === "offboarded" ? <button type="button"
                  className="secondary-button" disabled={busy}
                  onClick={() => beginLifecycle(account, "return_to_work", "復職帳號")}>復職</button> : null}
                {account.accountStatus !== "offboarded" ? <button type="button"
                  className="danger-button" disabled={busy}
                  onClick={() => beginLifecycle(account, "offboard", "辦理離職")}>離職</button> : null}
              </td>
            </tr>)}</tbody>
          </table></div>}
    </section> : <section className="panel account-management-panel">
      <h2>新增應用帳號</h2>
      <p>先輸入完整 principal ID 查詢已發布身分；此操作不建立 Google 或 Firebase 帳號，也不自動指派角色。</p>
      <form onSubmit={(event) => void findCandidate(event)}>
        <label>principal ID <input value={principalId} required maxLength={255} disabled={busy || Boolean(pendingProvision)}
          onChange={(event) => { setPrincipalId(event.target.value); setCandidates([]); setSelected(null); invalidateOperation(); }} /></label>
        <button className="secondary-button" type="submit" disabled={busy || Boolean(pendingProvision) || !principalId.trim()}>查詢已發布身分</button>
      </form>
      {candidates.length ? <fieldset><legend>選擇身分來源</legend>
        {candidates.map((candidate) => <label key={`${candidate.identityIssuer}\0${candidate.identitySubject}`}>
          <input type="radio" name="principal-candidate" checked={selected === candidate}
            disabled={busy || Boolean(pendingProvision)}
            onChange={() => { setSelected(candidate); invalidateOperation(); }} />
          {candidate.employeeId} · {candidate.accountType} · {candidate.identityIssuer} / {candidate.identitySubject}
        </label>)}
      </fieldset> : null}
      {selected ? <form onSubmit={(event) => void createAccount(event)}>
        <label>顯示名稱 <input value={displayName} required maxLength={255} disabled={busy || Boolean(pendingProvision)}
          onChange={(event) => { setDisplayName(event.target.value); invalidateOperation(); }} /></label>
        <label>聯絡電子郵件（選填，不作身分比對） <input type="email" value={contactEmail} maxLength={254} disabled={busy || Boolean(pendingProvision)}
          onChange={(event) => { setContactEmail(event.target.value); invalidateOperation(); }} /></label>
        <label><input type="checkbox" checked={accountEnabled} disabled={busy || Boolean(pendingProvision)}
          onChange={(event) => { setAccountEnabled(event.target.checked); invalidateOperation(); }} /> 建立後啟用此應用帳號</label>
        <button className="primary-button" type="submit" disabled={busy || !displayName.trim()}>
          {busy ? "建立中..." : "建立應用帳號"}
        </button>
      </form> : null}
      {message ? <p role={receipt ? "status" : "alert"}>{message}</p> : null}
      {pendingProvision ? <p role="status">建立結果尚未核對；請以原操作 ID 重試，不要另建相同帳號。</p> : null}
      {receipt ? <p role="status">操作 {receipt.operationId} · 應用資料 {receipt.pdmUserId} · {statusText[receipt.current.accountStatus]}</p> : null}
      {receipt ? <button type="button" className="secondary-button" onClick={() => {
        setPrincipalId(""); setCandidates([]); setSelected(null); setDisplayName("");
        setContactEmail(""); setAccountEnabled(false); setOperationId(null);
        setReceipt(null); setMessage("");
      }}>建立另一個帳號</button> : null}
    </section>}
    <ReasonActionDialog open={Boolean(lifecycleIntent)} title={lifecycleIntent?.title ?? "帳號狀態異動"}
      description="此操作會使該帳號既有登入失效；原因會寫入不可變操作紀錄。"
      defaultReason={lifecycleIntent?.reason ?? ""}
      confirmLabel={lifecycleIntent?.title ?? "確認"} tone={lifecycleIntent?.action === "offboard" ? "danger" : "default"}
      busy={busy} onCancel={() => { setLifecycleIntent(null); if (!pendingLifecycle) setLifecycleMessage(""); }}
      onConfirm={async (reason) => { await updateLifecycle(reason); }} />
  </div>;
}
