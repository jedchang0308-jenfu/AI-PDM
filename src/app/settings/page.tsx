"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Folder,
  FolderOpen,
  Info,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCog
} from "lucide-react";
import { InfoHint } from "@/components/compact-hints";

type SettingsState =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "unauthorized" }
  | { status: "ready"; settings: Record<string, boolean | string> }
  | { status: "error"; message: string };

type AdminRole = {
  id: string;
  roleCode: string;
  title: string;
  systemDefined: boolean;
};

type AdminUser = {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
};

type RolePermission = {
  id: string;
  roleId: string;
  permissionKind: "page" | "action";
  permissionCode: string;
  allowed: boolean;
};

type RoleScope = {
  id: string;
  roleId: string;
  scopeKind: "department" | "project" | "action";
  scopeCode: string;
  allowed: boolean;
};

type RolePriorityVersion = {
  id: string;
  versionCode: string;
  priority: string[];
  status: string;
  createdBy: string | null;
  createdAt: string;
};

type ApprovalDelegation = {
  id: string;
  delegatedFrom: string;
  delegatedFromName: string;
  delegatedFromRole: string;
  delegatedTo: string;
  delegatedToName: string;
  delegatedToRole: string;
  projectCode: string | null;
  actionCode: string | null;
  startsAt: string | null;
  endsAt: string | null;
  reason: string;
  createdAt: string;
  revokedAt: string | null;
};

type RoleAssignment = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  userSystemRole: string;
  roleId: string;
  roleCode: string;
  roleTitle: string;
  reason: string;
  assignedBy: string;
  assignedAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
};

type ApprovalRule = {
  id: string;
  ruleVersionId: string;
  ruleName: string;
  actionCode: string;
  phase: string | null;
  recordStatus: string | null;
  itemKind: string | null;
  riskFlag: string | null;
  requiresApproval: boolean;
  approverRole: string | null;
  blocksUsage: boolean;
  blocksRelease: boolean;
  showsWarning: boolean;
  exportMarker: boolean;
};

type HardRule = {
  code: string;
  message: string;
  requiresApproval: boolean;
  blocksUsage: boolean;
  blocksRelease: boolean;
  showsWarning: boolean;
  exportMarker: boolean;
  editable: false;
};

type RuleTemplate = {
  id: string;
  templateCode: string;
  title: string;
  description: string;
  systemDefined: boolean;
};

type RuleVersion = {
  id: string;
  ruleCode: string;
  title: string;
  status: string;
  effectiveAt: string;
  retiredAt: string | null;
};

type MatrixResponse = {
  ruleVersionId: string;
  roles: AdminRole[];
  users: AdminUser[];
  rolePermissions: RolePermission[];
  roleScopes: RoleScope[];
  rolePriorityVersions: RolePriorityVersion[];
  activeRolePriority: string[];
  roleAssignments: RoleAssignment[];
  approvalDelegations: ApprovalDelegation[];
  approvalRules: ApprovalRule[];
  hardRules: HardRule[];
  ruleTemplates: RuleTemplate[];
  ruleVersions: RuleVersion[];
  options: {
    actionCodes: string[];
    pagePermissionCodes: string[];
    phases: string[];
    recordStatuses: string[];
    itemKinds: string[];
    riskFlags: string[];
  };
};

type RuleDraft = Omit<ApprovalRule, "id"> & { id?: string };

type GDriveFolderNode = {
  id: string;
  name: string;
  mimeType: string;
  driveId: string | null;
  hasChildren: boolean;
  webViewLink: string;
};

type VerifiedFolderSnapshot = {
  id: string;
  name: string;
  path: string;
  verifiedAt: string;
  webViewLink?: string;
  driveId?: string | null;
};

type FolderChildrenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; folders: GDriveFolderNode[] }
  | { status: "error"; message: string };

const emptyRuleDraft: RuleDraft = {
  ruleVersionId: "numbering-rule-v1",
  ruleName: "",
  actionCode: "",
  phase: null,
  recordStatus: null,
  itemKind: null,
  riskFlag: null,
  requiresApproval: false,
  approverRole: null,
  blocksUsage: false,
  blocksRelease: false,
  showsWarning: true,
  exportMarker: true
};

export default function SettingsPage() {
  const [state, setState] = useState<SettingsState>({ status: "loading" });

  const fetchSettings = () => {
    fetch("/api/settings")
      .then(async (response) => {
        if (response.status === 401) {
          setState({ status: "unauthorized" });
          return;
        }
        if (response.status === 403) {
          setState({ status: "forbidden" });
          return;
        }
        const body = await response.json();
        if (!response.ok) {
          setState({ status: "error", message: body.error ?? "設定讀取失敗" });
          return;
        }
        setState({ status: "ready", settings: body.settings ?? {} });
      })
      .catch((error) => setState({ status: "error", message: error instanceof Error ? error.message : "未知錯誤" }));
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>系統設定</h1>
          <p>僅系統管理員可以查看與調整系統設定。</p>
        </div>
      </div>

      {state.status === "loading" ? (
        <section className="panel">
          <div className="empty">正在載入設定...</div>
        </section>
      ) : null}
      {state.status === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再查看系統設定。" /> : null}
      {state.status === "forbidden" ? <AccessPanel title="需要系統管理員權限" message="只有系統管理員可以管理系統設定。" /> : null}
      {state.status === "error" ? <AccessPanel title="無法讀取設定" message={state.message} /> : null}
      {state.status === "ready" ? <SettingsPanel settings={state.settings} onSaved={fetchSettings} /> : null}
    </>
  );
}

function AccessPanel({ title, message }: { title: string; message: string }) {
  const showLoginLink = title === "需要登入";

  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={22} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{message}</p>
        {showLoginLink ? (
          <div className="empty-actions">
            <Link className="primary-button" href="/login">
              前往登入
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SettingsPanel({ settings, onSaved }: { settings: Record<string, boolean | string>; onSaved: () => void }) {
  const [pendingFolder, setPendingFolder] = useState(String(settings.gdrive_pending_folder_id ?? ""));
  const [releasedFolder, setReleasedFolder] = useState(String(settings.gdrive_released_folder_id ?? ""));
  const [pendingSnapshot, setPendingSnapshot] = useState<VerifiedFolderSnapshot | null>(() => snapshotFromSettings(settings, "pending"));
  const [releasedSnapshot, setReleasedSnapshot] = useState<VerifiedFolderSnapshot | null>(() => snapshotFromSettings(settings, "released"));
  const [selectedFolder, setSelectedFolder] = useState<GDriveFolderNode | null>(null);
  const [childrenByParent, setChildrenByParent] = useState<Record<string, FolderChildrenState>>({ root: { status: "idle" } });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ root: true });
  const [loading, setLoading] = useState(false);
  const [folderLoading, setFolderLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (settings.serviceAccountConfigured) {
      loadFolderChildren("root");
    } else {
      setChildrenByParent({ root: { status: "error", message: "Google Drive service account 尚未設定" } });
    }
  }, [settings.serviceAccountConfigured]);

  async function loadFolderChildren(parentId: string) {
    setFolderLoading(parentId);
    setChildrenByParent((current) => ({ ...current, [parentId]: { status: "loading" } }));
    try {
      const response = await fetch(`/api/settings/gdrive/folders?parentId=${encodeURIComponent(parentId)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? body.error ?? "資料夾讀取失敗");
      setChildrenByParent((current) => ({ ...current, [parentId]: { status: "ready", folders: body.folders ?? [] } }));
    } catch (error) {
      setChildrenByParent((current) => ({
        ...current,
        [parentId]: { status: "error", message: error instanceof Error ? error.message : "資料夾讀取失敗" }
      }));
    } finally {
      setFolderLoading(null);
    }
  }

  function toggleFolder(folderId: string) {
    const nextExpanded = !expanded[folderId];
    setExpanded((current) => ({ ...current, [folderId]: nextExpanded }));
    if (nextExpanded && childrenByParent[folderId]?.status !== "ready") {
      loadFolderChildren(folderId);
    }
  }

  async function verifyAndAssign(use: "pending" | "released", folder = selectedFolder) {
    if (!folder) {
      setMessage({ type: "error", text: "請先選取 Google Drive 資料夾" });
      return;
    }
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/settings/gdrive/folders/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: folder.id, intendedUse: use })
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? body.error ?? "資料夾驗證失敗" });
      return;
    }
    const snapshot: VerifiedFolderSnapshot = {
      id: body.folder.id,
      name: body.folder.name,
      path: body.folder.path,
      verifiedAt: body.verifiedAt,
      webViewLink: body.folder.webViewLink,
      driveId: body.folder.driveId ?? null
    };
    if (use === "pending") {
      setPendingFolder(snapshot.id);
      setPendingSnapshot(snapshot);
    } else {
      setReleasedFolder(snapshot.id);
      setReleasedSnapshot(snapshot);
    }
    setMessage({ type: "success", text: `${snapshot.name} 已驗證並指定為${use === "pending" ? "待審核暫存區" : "正式發布區"}` });
  }

  async function verifyManualFolder(use: "pending" | "released") {
    const folderId = use === "pending" ? pendingFolder : releasedFolder;
    if (!folderId.trim()) {
      setMessage({ type: "error", text: "請先輸入 Folder ID" });
      return;
    }
    const manualNode: GDriveFolderNode = {
      id: folderId.trim(),
      name: folderId.trim(),
      mimeType: "application/vnd.google-apps.folder",
      driveId: null,
      hasChildren: false,
      webViewLink: `https://drive.google.com/drive/folders/${encodeURIComponent(folderId.trim())}`
    };
    await verifyAndAssign(use, manualNode);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (pendingFolder && releasedFolder && pendingFolder === releasedFolder) {
      setLoading(false);
      setMessage({ type: "error", text: "待審核暫存區與正式發布區不可指向同一個資料夾" });
      return;
    }
    if ((pendingFolder && !pendingSnapshot) || (releasedFolder && !releasedSnapshot)) {
      setLoading(false);
      setMessage({ type: "error", text: "請先驗證選取的 Google Drive 資料夾，再儲存設定" });
      return;
    }

    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gdrive_pending_folder_id: pendingFolder,
        ...folderSnapshotPayload("pending", pendingSnapshot),
        gdrive_released_folder_id: releasedFolder,
        ...folderSnapshotPayload("released", releasedSnapshot),
        gdrive_require_verified: true
      })
    });
    const body = await res.json().catch(() => ({}));

    setLoading(false);
    if (!res.ok) {
      setMessage({ type: "error", text: body.error ?? "儲存失敗" });
      return;
    }

    setMessage({ type: "success", text: "設定已儲存" });
    onSaved();
  }

  const readonlySettings = Object.entries(settings).filter(
    ([key]) => !key.startsWith("gdrive_pending_folder_") && !key.startsWith("gdrive_released_folder_")
  );
  const selectedSnapshot =
    selectedFolder && pendingSnapshot?.id === selectedFolder.id ? pendingSnapshot : selectedFolder && releasedSnapshot?.id === selectedFolder.id ? releasedSnapshot : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <section className="panel">
        <div className="panel-header">
          <h2>Google Drive 設定</h2>
        </div>
        <form onSubmit={submit} style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="settings-drive-status">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              Service Account：{settings.serviceAccountConfigured ? "已設定，可瀏覽 Google Drive" : "未設定，請先設定 GOOGLE_SERVICE_ACCOUNT_KEY_PATH"}
            </span>
          </div>

          <div className="settings-drive-layout">
            <div className="settings-drive-tree" data-testid="gdrive-folder-tree">
              <div className="settings-drive-tree-title">Google Drive</div>
              <FolderTreeRoot
                childrenByParent={childrenByParent}
                expanded={expanded}
                selectedFolderId={selectedFolder?.id ?? ""}
                folderLoading={folderLoading}
                onToggle={toggleFolder}
                onSelect={setSelectedFolder}
                onRetry={loadFolderChildren}
              />
            </div>

            <div className="settings-drive-detail" data-testid="gdrive-folder-detail">
              <div className="settings-drive-detail-header">
                <div>
                  <h3>{selectedFolder?.name ?? "尚未選取資料夾"}</h3>
                  <p>{selectedFolder ? "請驗證後指定用途，再儲存設定。" : "從左側資料夾樹選取待審核暫存區或正式發布區。"}</p>
                </div>
                {selectedFolder ? (
                  <div className="settings-drive-detail-actions">
                    <a className="secondary-button" href={selectedFolder.webViewLink} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      開啟 Google Drive
                    </a>
                    <button className="secondary-button" type="button" onClick={() => navigator.clipboard?.writeText(selectedFolder.id)}>
                      <Copy size={16} />
                      複製 Folder ID
                    </button>
                  </div>
                ) : null}
              </div>

              {selectedFolder ? (
                <div className="settings-drive-metadata">
                  <div>
                    <span>路徑</span>
                    <strong>{selectedSnapshot?.path ?? `Google Drive / ${selectedFolder.name}`}</strong>
                  </div>
                  <div>
                    <span>Folder ID</span>
                    <strong>{selectedFolder.id}</strong>
                  </div>
                  <div>
                    <span>Drive 類型</span>
                    <strong>{selectedFolder.driveId ? "Shared Drive" : "My Drive / root"}</strong>
                  </div>
                  <div>
                    <span>權限狀態</span>
                    <strong>{selectedSnapshot ? "已驗證" : "需驗證"}</strong>
                  </div>
                  <div>
                    <span>最後驗證時間</span>
                    <strong>{selectedSnapshot ? formatDateTime(selectedSnapshot.verifiedAt) : "尚未驗證"}</strong>
                  </div>
                </div>
              ) : null}

              <div className="settings-drive-assign-actions">
                <button className="primary-button" type="button" disabled={!selectedFolder || loading} onClick={() => verifyAndAssign("pending")}>
                  設為待審核暫存區
                </button>
                <button className="secondary-button" type="button" disabled={!selectedFolder || loading} onClick={() => verifyAndAssign("released")}>
                  設為正式發布區
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!selectedFolder || loading}
                  onClick={() => {
                    if (!selectedFolder) return;
                    verifyAndAssign(selectedFolder.id === releasedFolder ? "released" : "pending", selectedFolder);
                  }}
                >
                  <RefreshCw size={16} />
                  重新驗證權限
                </button>
              </div>
            </div>
          </div>

          <div className="settings-drive-summary">
            <FolderAssignmentCard title="待審核暫存區" folderId={pendingFolder} snapshot={pendingSnapshot} />
            <FolderAssignmentCard title="正式發布區" folderId={releasedFolder} snapshot={releasedSnapshot} />
          </div>

          <details className="settings-drive-manual">
            <summary>進階：手動貼 Folder ID</summary>
            <div className="settings-drive-manual-grid">
              <label style={labelStyle}>
                待審核資料夾 ID
                <input
                  value={pendingFolder}
                  onChange={(e) => {
                    setPendingFolder(e.target.value);
                    setPendingSnapshot(null);
                  }}
                  placeholder="例如：1A2b3C4d5E6f7G8h9I0j"
                  style={fieldStyle}
                />
                <button className="secondary-button" type="button" onClick={() => verifyManualFolder("pending")} disabled={loading}>
                  驗證手動 ID
                </button>
              </label>

              <label style={labelStyle}>
                正式發布資料夾 ID
                <input
                  value={releasedFolder}
                  onChange={(e) => {
                    setReleasedFolder(e.target.value);
                    setReleasedSnapshot(null);
                  }}
                  placeholder="例如：0J9i8H7g6F5e4D3c2B1a"
                  style={fieldStyle}
                />
                <button className="secondary-button" type="button" onClick={() => verifyManualFolder("released")} disabled={loading}>
                  驗證手動 ID
                </button>
              </label>
            </div>
          </details>

          {message ? (
            <div
              style={{
                color: message.type === "error" ? "var(--danger)" : "var(--success)",
                fontSize: "0.9rem",
                padding: "0.5rem",
                backgroundColor: message.type === "error" ? "#feecec" : "#e8f7ef",
                borderRadius: "4px"
              }}
            >
              {message.text}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="primary-button" type="submit" disabled={loading}>
              <Save size={16} />
              {loading ? "儲存中..." : "儲存設定"}
            </button>
          </div>
        </form>
      </section>

      <ApprovalMatrixSettings />

      <section className="panel">
        <div className="panel-header">
          <h2>環境設定（唯讀）</h2>
        </div>
        <div className="detail">
          {readonlySettings.map(([key, value]) => (
            <div className="detail-row" key={key}>
              <span>{key}</span>
              <strong>{formatSettingValue(value)}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FolderTreeRoot({
  childrenByParent,
  expanded,
  selectedFolderId,
  folderLoading,
  onToggle,
  onSelect,
  onRetry
}: {
  childrenByParent: Record<string, FolderChildrenState>;
  expanded: Record<string, boolean>;
  selectedFolderId: string;
  folderLoading: string | null;
  onToggle: (folderId: string) => void;
  onSelect: (folder: GDriveFolderNode) => void;
  onRetry: (parentId: string) => void;
}) {
  const rootState = childrenByParent.root ?? { status: "idle" };
  return (
    <div>
      <button className="settings-drive-tree-row" type="button" onClick={() => onToggle("root")}>
        {expanded.root ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <FolderOpen size={16} />
        <span>Google Drive</span>
      </button>
      {expanded.root ? (
        <FolderTreeNodes
          parentId="root"
          depth={1}
          state={rootState}
          childrenByParent={childrenByParent}
          expanded={expanded}
          selectedFolderId={selectedFolderId}
          folderLoading={folderLoading}
          onToggle={onToggle}
          onSelect={onSelect}
          onRetry={onRetry}
        />
      ) : null}
    </div>
  );
}

function FolderTreeNodes({
  parentId,
  depth,
  state,
  childrenByParent,
  expanded,
  selectedFolderId,
  folderLoading,
  onToggle,
  onSelect,
  onRetry
}: {
  parentId: string;
  depth: number;
  state: FolderChildrenState;
  childrenByParent: Record<string, FolderChildrenState>;
  expanded: Record<string, boolean>;
  selectedFolderId: string;
  folderLoading: string | null;
  onToggle: (folderId: string) => void;
  onSelect: (folder: GDriveFolderNode) => void;
  onRetry: (parentId: string) => void;
}) {
  if (state.status === "idle" || state.status === "loading") {
    return <div className="settings-drive-tree-message" style={{ paddingLeft: `${depth * 18}px` }}>讀取資料夾中...</div>;
  }
  if (state.status === "error") {
    return (
      <div className="settings-drive-tree-message" style={{ paddingLeft: `${depth * 18}px` }}>
        <span>{state.message}</span>
        <button className="link-button" type="button" onClick={() => onRetry(parentId)}>
          重試
        </button>
      </div>
    );
  }
  if (state.folders.length === 0) {
    return <div className="settings-drive-tree-message" style={{ paddingLeft: `${depth * 18}px` }}>沒有子資料夾</div>;
  }

  return (
    <div>
      {state.folders.map((folder) => {
        const isExpanded = Boolean(expanded[folder.id]);
        const isSelected = selectedFolderId === folder.id;
        const childState = childrenByParent[folder.id] ?? { status: "idle" };
        return (
          <div key={folder.id}>
            <div
              className={`settings-drive-tree-row${isSelected ? " is-selected" : ""}`}
              style={{ paddingLeft: `${depth * 18}px` }}
            >
              <button className="icon-button" type="button" onClick={() => onToggle(folder.id)} aria-label={`${folder.name} 展開`}>
                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              <button className="settings-drive-tree-select" type="button" onClick={() => onSelect(folder)}>
                {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                <span>{folder.name}</span>
              </button>
              {folderLoading === folder.id ? <span className="settings-drive-loading-dot">讀取</span> : null}
            </div>
            {isExpanded ? (
              <FolderTreeNodes
                parentId={folder.id}
                depth={depth + 1}
                state={childState}
                childrenByParent={childrenByParent}
                expanded={expanded}
                selectedFolderId={selectedFolderId}
                folderLoading={folderLoading}
                onToggle={onToggle}
                onSelect={onSelect}
                onRetry={onRetry}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FolderAssignmentCard({ title, folderId, snapshot }: { title: string; folderId: string; snapshot: VerifiedFolderSnapshot | null }) {
  return (
    <div className="settings-drive-assignment">
      <span>{title}</span>
      <strong>{snapshot?.path || folderId || "未設定"}</strong>
      <small>
        {snapshot ? `已驗證：${formatDateTime(snapshot.verifiedAt)}` : folderId ? "尚未驗證" : "請從左側樹狀圖選取"}
      </small>
    </div>
  );
}

function snapshotFromSettings(settings: Record<string, boolean | string>, use: "pending" | "released"): VerifiedFolderSnapshot | null {
  const id = String(settings[`gdrive_${use}_folder_id`] ?? "").trim();
  const name = String(settings[`gdrive_${use}_folder_name`] ?? "").trim();
  const path = String(settings[`gdrive_${use}_folder_path`] ?? "").trim();
  const verifiedAt = String(settings[`gdrive_${use}_folder_verified_at`] ?? "").trim();
  if (!id || !name || !path || !verifiedAt) return null;
  return { id, name, path, verifiedAt };
}

function folderSnapshotPayload(use: "pending" | "released", snapshot: VerifiedFolderSnapshot | null) {
  return {
    [`gdrive_${use}_folder_name`]: snapshot?.name ?? "",
    [`gdrive_${use}_folder_path`]: snapshot?.path ?? "",
    [`gdrive_${use}_folder_verified_at`]: snapshot?.verifiedAt ?? ""
  };
}

function ApprovalMatrixSettings() {
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [newRule, setNewRule] = useState<RuleDraft>(emptyRuleDraft);
  const [newRole, setNewRole] = useState({ roleCode: "", title: "" });
  const [priorityText, setPriorityText] = useState("");
  const [priorityReason, setPriorityReason] = useState("");
  const [scopeDraft, setScopeDraft] = useState({ roleId: "role-rd-manager", scopeKind: "project", scopeCode: "" });
  const [assignmentDraft, setAssignmentDraft] = useState({ userId: "", roleId: "", reason: "" });
  const [delegationDraft, setDelegationDraft] = useState({
    delegatedFrom: "",
    delegatedTo: "",
    projectCode: "",
    actionCode: "",
    startsAt: "",
    endsAt: "",
    reason: ""
  });
  const [loading, setLoading] = useState(true);
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const loadMatrix = () => {
    setLoading(true);
    fetch("/api/numbering/admin/matrix")
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "審核矩陣讀取失敗");
        const nextMatrix = body as MatrixResponse;
        setMatrix(nextMatrix);
        setDrafts(Object.fromEntries(nextMatrix.approvalRules.map((rule) => [rule.id, { ...rule }])));
        setNewRule({ ...emptyRuleDraft, ruleVersionId: nextMatrix.ruleVersionId });
        setPriorityText(nextMatrix.activeRolePriority.join(", "));
        setScopeDraft((current) => ({ ...current, roleId: nextMatrix.roles.find((role) => role.roleCode === "rd_manager")?.id ?? nextMatrix.roles[0]?.id ?? "" }));
        setAssignmentDraft((current) => ({
          ...current,
          userId: current.userId || nextMatrix.users.find((user) => user.role === "Engineer")?.id || nextMatrix.users[0]?.id || "",
          roleId: current.roleId || nextMatrix.roles.find((role) => !role.systemDefined)?.id || nextMatrix.roles.find((role) => role.roleCode === "qa")?.id || nextMatrix.roles[0]?.id || ""
        }));
        setDelegationDraft((current) => ({
          ...current,
          delegatedFrom: current.delegatedFrom || nextMatrix.users.find((user) => user.role === "R&D Manager")?.id || nextMatrix.users[0]?.id || "",
          delegatedTo: current.delegatedTo || nextMatrix.users.find((user) => user.role === "Engineer")?.id || nextMatrix.users[1]?.id || nextMatrix.users[0]?.id || ""
        }));
        setMessage(null);
      })
      .catch((error) => setMessage({ type: "error", text: error instanceof Error ? error.message : "未知錯誤" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMatrix();
  }, []);

  function updateDraft<K extends keyof RuleDraft>(ruleId: string, key: K, value: RuleDraft[K]) {
    setDrafts((current) => {
      const draft = current[ruleId];
      if (!draft) return current;
      return { ...current, [ruleId]: { ...draft, [key]: value } };
    });
  }

  function updateNewRule<K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) {
    setNewRule((current) => ({ ...current, [key]: value }));
  }

  async function saveRule(ruleId: string) {
    const draft = drafts[ruleId];
    if (!draft) return;
    await submitRule(draft, ruleId);
  }

  async function submitRule(rule: RuleDraft, ruleId: string) {
    setSavingRuleId(ruleId);
    setMessage(null);
    const response = await fetch("/api/numbering/admin/matrix", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rule)
    });
    const body = await response.json().catch(() => ({}));
    setSavingRuleId(null);
    if (!response.ok) {
      setMessage({ type: "error", text: body.error ?? "規則儲存失敗" });
      return;
    }
    setMessage({ type: "success", text: "審核規則已儲存" });
    loadMatrix();
  }

  async function applyTemplate(templateCode: string) {
    setSavingRuleId(`template-${templateCode}`);
    setMessage(null);
    const response = await fetch("/api/numbering/admin/matrix", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateCode })
    });
    const body = await response.json().catch(() => ({}));
    setSavingRuleId(null);
    if (!response.ok) {
      setMessage({ type: "error", text: body.error ?? "模板套用失敗" });
      return;
    }
    setMessage({ type: "success", text: "模板已套用" });
    loadMatrix();
  }

  async function submitAdminOperation(payload: Record<string, unknown>, successText: string) {
    setSavingRuleId(String(payload.operation ?? "admin-operation"));
    setMessage(null);
    const response = await fetch("/api/numbering/admin/matrix", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    setSavingRuleId(null);
    if (!response.ok) {
      setMessage({ type: "error", text: body.error ?? "設定儲存失敗" });
      return false;
    }
    setMessage({ type: "success", text: successText });
    loadMatrix();
    return true;
  }

  async function saveNewRole() {
    const ok = await submitAdminOperation({ operation: "role", roleCode: newRole.roleCode, title: newRole.title }, "角色已新增或更新");
    if (ok) setNewRole({ roleCode: "", title: "" });
  }

  async function togglePermission(role: AdminRole, permissionKind: "page" | "action", permissionCode: string, allowed: boolean) {
    await submitAdminOperation(
      { operation: "role_permission", roleId: role.id, permissionKind, permissionCode, allowed },
      `${role.title} 權限已更新`
    );
  }

  async function saveRolePriority() {
    await submitAdminOperation(
      {
        operation: "role_priority",
        priority: priorityText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        reason: priorityReason
      },
      "最高權限排序已建立新版本"
    );
  }

  async function addRoleScope() {
    const ok = await submitAdminOperation(
      {
        operation: "role_scope",
        roleId: scopeDraft.roleId,
        scopeKind: scopeDraft.scopeKind,
        scopeCode: scopeDraft.scopeCode,
        allowed: true
      },
      "主管範圍已更新"
    );
    if (ok) setScopeDraft((current) => ({ ...current, scopeCode: "" }));
  }

  async function toggleRoleScope(scope: RoleScope, allowed: boolean) {
    await submitAdminOperation(
      { operation: "role_scope", roleId: scope.roleId, scopeKind: scope.scopeKind, scopeCode: scope.scopeCode, allowed },
      "主管範圍狀態已更新"
    );
  }

  async function saveRoleAssignment() {
    const ok = await submitAdminOperation(
      { operation: "role_assignment", userId: assignmentDraft.userId, roleId: assignmentDraft.roleId, reason: assignmentDraft.reason },
      "使用者角色指派已更新"
    );
    if (ok) setAssignmentDraft((current) => ({ ...current, reason: "" }));
  }

  async function revokeRoleAssignment(id: string) {
    await submitAdminOperation({ operation: "revoke_role_assignment", id, reason: "管理員撤銷使用者角色指派" }, "使用者角色指派已撤銷");
  }

  async function saveDelegation() {
    const ok = await submitAdminOperation({ operation: "delegation", ...delegationDraft }, "代理人設定已儲存");
    if (ok) {
      setDelegationDraft((current) => ({ ...current, projectCode: "", actionCode: "", startsAt: "", endsAt: "", reason: "" }));
    }
  }

  async function revokeDelegation(id: string) {
    await submitAdminOperation({ operation: "revoke_delegation", id, reason: "管理員於設定台撤銷" }, "代理人設定已撤銷");
  }

  if (loading) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>審核矩陣設定台</h2>
        </div>
        <div className="empty">正在載入審核矩陣...</div>
      </section>
    );
  }

  if (!matrix) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>審核矩陣設定台</h2>
        </div>
        <div className="empty">{message?.text ?? "審核矩陣讀取失敗"}</div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>審核矩陣設定台</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            規則版本：{matrix.ruleVersionId}
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={loadMatrix}>
          <RotateCcw size={16} />
          重新載入
        </button>
      </div>

      <div style={{ padding: "1rem", display: "grid", gap: "1rem" }}>
        {message ? (
          <div
            style={{
              color: message.type === "error" ? "var(--danger)" : "var(--success)",
              background: message.type === "error" ? "#feecec" : "#e8f7ef",
              borderRadius: "6px",
              padding: "0.5rem 0.75rem",
              fontSize: "0.9rem"
            }}
          >
            {message.text}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <strong>規則模板</strong>
            <InfoMark text="模板會批次更新可設定的 approval rules；唯一性、主要 MA 圖等硬限制不會被模板關閉。" />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {matrix.ruleTemplates.map((template) => (
              <button
                className="secondary-button"
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template.templateCode)}
                disabled={savingRuleId === `template-${template.templateCode}`}
                title={template.description}
              >
                <SlidersHorizontal size={16} />
                {template.title}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table style={{ minWidth: "1180px" }}>
            <thead>
              <tr>
                <th>規則</th>
                <th>動作</th>
                <th>階段</th>
                <th>狀態</th>
                <th>料件</th>
                <th>風險</th>
                <th>審核角色</th>
                <th>控制</th>
                <th>標示</th>
                <th>儲存</th>
              </tr>
            </thead>
            <tbody>
              {matrix.approvalRules.map((rule) => {
                const draft = drafts[rule.id] ?? { ...rule };
                return (
                  <tr key={rule.id}>
                    <td>
                      <input
                        value={draft.ruleName}
                        onChange={(event) => updateDraft(rule.id, "ruleName", event.target.value)}
                        style={fieldStyle}
                      />
                    </td>
                    <td>
                      <input
                        list="numbering-action-codes"
                        value={draft.actionCode}
                        onChange={(event) => updateDraft(rule.id, "actionCode", event.target.value)}
                        style={fieldStyle}
                      />
                    </td>
                    <td>
                      <MatrixSelect value={draft.phase} options={matrix.options.phases} onChange={(value) => updateDraft(rule.id, "phase", value)} />
                    </td>
                    <td>
                      <MatrixSelect
                        value={draft.recordStatus}
                        options={matrix.options.recordStatuses}
                        onChange={(value) => updateDraft(rule.id, "recordStatus", value)}
                      />
                    </td>
                    <td>
                      <MatrixSelect
                        value={draft.itemKind}
                        options={matrix.options.itemKinds}
                        onChange={(value) => updateDraft(rule.id, "itemKind", value)}
                      />
                    </td>
                    <td>
                      <input
                        list="numbering-risk-flags"
                        value={draft.riskFlag ?? ""}
                        onChange={(event) => updateDraft(rule.id, "riskFlag", emptyToNull(event.target.value))}
                        style={fieldStyle}
                      />
                    </td>
                    <td>
                      <MatrixSelect
                        value={draft.approverRole}
                        options={matrix.roles.map((role) => role.roleCode)}
                        labels={Object.fromEntries(matrix.roles.map((role) => [role.roleCode, role.title]))}
                        onChange={(value) => updateDraft(rule.id, "approverRole", value)}
                      />
                    </td>
                    <td>
                      <FlagControls draft={draft} onChange={(key, value) => updateDraft(rule.id, key, value)} />
                    </td>
                    <td>
                      <MarkerControls draft={draft} onChange={(key, value) => updateDraft(rule.id, key, value)} />
                    </td>
                    <td>
                      <button className="secondary-button" type="button" onClick={() => saveRule(rule.id)} disabled={savingRuleId === rule.id} title="儲存規則">
                        <Save size={16} />
                        儲存
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td>
                  <input value={newRule.ruleName} onChange={(event) => updateNewRule("ruleName", event.target.value)} placeholder="新規則名稱" style={fieldStyle} />
                </td>
                <td>
                  <input
                    list="numbering-action-codes"
                    value={newRule.actionCode}
                    onChange={(event) => updateNewRule("actionCode", event.target.value)}
                    placeholder="action_code"
                    style={fieldStyle}
                  />
                </td>
                <td>
                  <MatrixSelect value={newRule.phase} options={matrix.options.phases} onChange={(value) => updateNewRule("phase", value)} />
                </td>
                <td>
                  <MatrixSelect value={newRule.recordStatus} options={matrix.options.recordStatuses} onChange={(value) => updateNewRule("recordStatus", value)} />
                </td>
                <td>
                  <MatrixSelect value={newRule.itemKind} options={matrix.options.itemKinds} onChange={(value) => updateNewRule("itemKind", value)} />
                </td>
                <td>
                  <input
                    list="numbering-risk-flags"
                    value={newRule.riskFlag ?? ""}
                    onChange={(event) => updateNewRule("riskFlag", emptyToNull(event.target.value))}
                    style={fieldStyle}
                  />
                </td>
                <td>
                  <MatrixSelect
                    value={newRule.approverRole}
                    options={matrix.roles.map((role) => role.roleCode)}
                    labels={Object.fromEntries(matrix.roles.map((role) => [role.roleCode, role.title]))}
                    onChange={(value) => updateNewRule("approverRole", value)}
                  />
                </td>
                <td>
                  <FlagControls draft={newRule} onChange={updateNewRule} />
                </td>
                <td>
                  <MarkerControls draft={newRule} onChange={updateNewRule} />
                </td>
                <td>
                  <button className="primary-button" type="button" onClick={() => submitRule(newRule, "new")} disabled={savingRuleId === "new"}>
                    <Plus size={16} />
                    新增
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <datalist id="numbering-action-codes">
          {matrix.options.actionCodes.map((actionCode) => (
            <option key={actionCode} value={actionCode} />
          ))}
        </datalist>
        <datalist id="numbering-risk-flags">
          {matrix.options.riskFlags.map((riskFlag) => (
            <option key={riskFlag} value={riskFlag} />
          ))}
        </datalist>

        <div className="table-wrap">
          <table style={{ minWidth: "760px" }}>
            <thead>
              <tr>
                <th>不可關閉硬限制</th>
                <th>審核</th>
                <th>阻擋使用</th>
                <th>阻擋發行</th>
                <th>警示</th>
                <th>匯出標示</th>
              </tr>
            </thead>
            <tbody>
              {matrix.hardRules.map((rule) => (
                <tr key={rule.code}>
                  <td>
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      <ShieldCheck size={15} aria-hidden="true" />
                      {rule.code}
                      <InfoMark text={rule.message} />
                    </strong>
                  </td>
                  <td>{formatBoolean(rule.requiresApproval)}</td>
                  <td>{formatBoolean(rule.blocksUsage)}</td>
                  <td>{formatBoolean(rule.blocksRelease)}</td>
                  <td>{formatBoolean(rule.showsWarning)}</td>
                  <td>{formatBoolean(rule.exportMarker)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <RoleSummary roles={matrix.roles} />
        <RolePermissionMatrix matrix={matrix} newRole={newRole} setNewRole={setNewRole} onSaveRole={saveNewRole} onToggle={togglePermission} />
        <RoleAssignmentPanel
          matrix={matrix}
          draft={assignmentDraft}
          setDraft={setAssignmentDraft}
          onSave={saveRoleAssignment}
          onRevoke={revokeRoleAssignment}
        />
        <RolePriorityPanel
          matrix={matrix}
          priorityText={priorityText}
          setPriorityText={setPriorityText}
          priorityReason={priorityReason}
          setPriorityReason={setPriorityReason}
          onSave={saveRolePriority}
        />
        <RoleScopePanel matrix={matrix} draft={scopeDraft} setDraft={setScopeDraft} onSave={addRoleScope} onToggle={toggleRoleScope} />
        <DelegationPanel matrix={matrix} draft={delegationDraft} setDraft={setDelegationDraft} onSave={saveDelegation} onRevoke={revokeDelegation} />
        <RuleVersionSummary versions={matrix.ruleVersions} />
        <RuleSimulator matrix={matrix} />
      </div>
    </section>
  );
}

function RuleSimulator({ matrix }: { matrix: MatrixResponse }) {
  const [actionCode, setActionCode] = useState("release");
  const [phase, setPhase] = useState<string | null>("Release");
  const [recordStatus, setRecordStatus] = useState<string | null>(null);
  const [itemKind, setItemKind] = useState<string | null>("manufactured");
  const [riskFlags, setRiskFlags] = useState("missing_primary_ma");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  async function simulate() {
    setLoading(true);
    const response = await fetch("/api/numbering/rule-simulator", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actionCode,
        phase,
        recordStatus,
        itemKind,
        riskFlags: riskFlags
          .split(",")
          .map((flag) => flag.trim())
          .filter(Boolean),
        ruleVersionId: matrix.ruleVersionId
      })
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    setResult(body);
  }

  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <SlidersHorizontal size={18} aria-hidden="true" />
        <strong>規則模擬器</strong>
        <InfoMark text="輸入動作、階段、狀態、料件與風險旗標後，系統會用目前矩陣加不可關閉硬限制計算審核結果。" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
        <label style={labelStyle}>
          動作
          <input list="numbering-action-codes" value={actionCode} onChange={(event) => setActionCode(event.target.value)} style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          階段
          <MatrixSelect value={phase} options={matrix.options.phases} onChange={setPhase} />
        </label>
        <label style={labelStyle}>
          狀態
          <MatrixSelect value={recordStatus} options={matrix.options.recordStatuses} onChange={setRecordStatus} />
        </label>
        <label style={labelStyle}>
          料件
          <MatrixSelect value={itemKind} options={matrix.options.itemKinds} onChange={setItemKind} />
        </label>
        <label style={labelStyle}>
          風險旗標
          <input value={riskFlags} onChange={(event) => setRiskFlags(event.target.value)} placeholder="missing_primary_ma, has_override" style={fieldStyle} />
        </label>
      </div>
      <div>
        <button className="secondary-button" type="button" onClick={simulate} disabled={loading}>
          <Info size={16} />
          {loading ? "模擬中..." : "模擬"}
        </button>
      </div>
      {result ? (
        <pre style={{ margin: 0, padding: "0.75rem", overflow: "auto", background: "var(--panel-2)", borderRadius: "6px", fontSize: "0.8rem" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function RoleSummary({ roles }: { roles: AdminRole[] }) {
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "560px" }}>
        <thead>
          <tr>
            <th>角色</th>
            <th>代碼</th>
            <th>類型</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td>{role.title}</td>
              <td>{role.roleCode}</td>
              <td>{role.systemDefined ? "內建" : "自訂"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolePermissionMatrix({
  matrix,
  newRole,
  setNewRole,
  onSaveRole,
  onToggle
}: {
  matrix: MatrixResponse;
  newRole: { roleCode: string; title: string };
  setNewRole: React.Dispatch<React.SetStateAction<{ roleCode: string; title: string }>>;
  onSaveRole: () => void;
  onToggle: (role: AdminRole, permissionKind: "page" | "action", permissionCode: string, allowed: boolean) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <KeyRound size={18} aria-hidden="true" />
        <strong>角色權限矩陣</strong>
        <InfoMark text="頁面權限控制可看哪些 PDM 頁面；動作權限控制可執行哪些審核、匯入、匯出與設定動作。" />
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "1180px" }}>
          <thead>
            <tr>
              <th>角色</th>
              {matrix.options.pagePermissionCodes.map((code) => (
                <th key={`page-${code}`}>{permissionLabel(code)}</th>
              ))}
              {matrix.options.actionCodes.map((code) => (
                <th key={`action-${code}`}>{permissionLabel(code)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.roles.map((role) => (
              <tr key={role.id}>
                <td>
                  <strong>{role.title}</strong>
                  <br />
                  <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{role.roleCode}</span>
                </td>
                {matrix.options.pagePermissionCodes.map((code) => (
                  <td key={`${role.id}-page-${code}`}>
                    <input
                      aria-label={`${role.title} ${code}`}
                      type="checkbox"
                      checked={rolePermissionEnabled(matrix, role.id, "page", code)}
                      onChange={(event) => onToggle(role, "page", code, event.target.checked)}
                    />
                  </td>
                ))}
                {matrix.options.actionCodes.map((code) => (
                  <td key={`${role.id}-action-${code}`}>
                    <input
                      aria-label={`${role.title} ${code}`}
                      type="checkbox"
                      checked={rolePermissionEnabled(matrix, role.id, "action", code)}
                      onChange={(event) => onToggle(role, "action", code, event.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) minmax(140px, 1fr) auto", gap: "0.75rem", alignItems: "end" }}>
        <label style={labelStyle}>
          自訂角色代碼
          <input value={newRole.roleCode} onChange={(event) => setNewRole((current) => ({ ...current, roleCode: event.target.value }))} style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          自訂角色名稱
          <input value={newRole.title} onChange={(event) => setNewRole((current) => ({ ...current, title: event.target.value }))} style={fieldStyle} />
        </label>
        <button className="secondary-button" type="button" onClick={onSaveRole}>
          <Plus size={16} />
          新增角色
        </button>
      </div>
    </div>
  );
}

function RoleAssignmentPanel({
  matrix,
  draft,
  setDraft,
  onSave,
  onRevoke
}: {
  matrix: MatrixResponse;
  draft: { userId: string; roleId: string; reason: string };
  setDraft: React.Dispatch<React.SetStateAction<{ userId: string; roleId: string; reason: string }>>;
  onSave: () => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <UserCog size={18} aria-hidden="true" />
        <strong>使用者角色指派</strong>
        <InfoMark text="系統角色仍由帳號資料決定；這裡可額外指派 PDM 內建或自訂角色，所有有效指派都會納入權限矩陣、最高權限排序與 audit 標示。" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", alignItems: "end" }}>
        <label style={labelStyle}>
          使用者
          <select
            className="dropdown-select"
            data-testid="role-assignment-user"
            value={draft.userId}
            onChange={(event) => setDraft((current) => ({ ...current, userId: event.target.value }))}
          >
            {matrix.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName} / {user.role}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          指派角色
          <select
            className="dropdown-select"
            data-testid="role-assignment-role"
            value={draft.roleId}
            onChange={(event) => setDraft((current) => ({ ...current, roleId: event.target.value }))}
          >
            {matrix.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.title} / {role.roleCode}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          指派原因
          <input
            data-testid="role-assignment-reason"
            value={draft.reason}
            onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
            style={fieldStyle}
          />
        </label>
        <button className="secondary-button" type="button" onClick={onSave}>
          <Save size={16} />
          儲存指派
        </button>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "900px" }}>
          <thead>
            <tr>
              <th>使用者</th>
              <th>系統角色</th>
              <th>PDM 角色</th>
              <th>原因</th>
              <th>指派時間</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {matrix.roleAssignments.length ? (
              matrix.roleAssignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>
                    <strong>{assignment.userName}</strong>
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{assignment.userEmail ?? assignment.userId}</span>
                  </td>
                  <td>{assignment.userSystemRole}</td>
                  <td>
                    {assignment.roleTitle}
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{assignment.roleCode}</span>
                  </td>
                  <td>{assignment.reason}</td>
                  <td>{formatDateTime(assignment.assignedAt)}</td>
                  <td>{assignment.revokedAt ? `已撤銷 ${formatDateTime(assignment.revokedAt)}` : "有效"}</td>
                  <td>
                    <button className="secondary-button" type="button" disabled={Boolean(assignment.revokedAt)} onClick={() => onRevoke(assignment.id)}>
                      撤銷
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>尚未建立額外角色指派</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RolePriorityPanel({
  matrix,
  priorityText,
  setPriorityText,
  priorityReason,
  setPriorityReason,
  onSave
}: {
  matrix: MatrixResponse;
  priorityText: string;
  setPriorityText: (value: string) => void;
  priorityReason: string;
  setPriorityReason: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <ShieldCheck size={18} aria-hidden="true" />
        <strong>最高權限排序</strong>
        <InfoMark text="同一使用者具備多角色且權限衝突時，依此排序取最高權限；只有系統管理員可調整。" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
        <label style={labelStyle}>
          排序（逗號分隔）
          <input value={priorityText} onChange={(event) => setPriorityText(event.target.value)} style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          調整原因
          <input value={priorityReason} onChange={(event) => setPriorityReason(event.target.value)} style={fieldStyle} />
        </label>
        <button className="secondary-button" type="button" onClick={onSave}>
          <Save size={16} />
          儲存排序
        </button>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "720px" }}>
          <thead>
            <tr>
              <th>版本</th>
              <th>狀態</th>
              <th>排序</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rolePriorityVersions.length ? (
              matrix.rolePriorityVersions.map((version) => (
                <tr key={version.id}>
                  <td>{version.versionCode}</td>
                  <td>{version.status}</td>
                  <td>{version.priority.join(" > ")}</td>
                  <td>{formatDateTime(version.createdAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td>內建預設</td>
                <td>active</td>
                <td>{matrix.activeRolePriority.join(" > ")}</td>
                <td>尚未建立版本</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleScopePanel({
  matrix,
  draft,
  setDraft,
  onSave,
  onToggle
}: {
  matrix: MatrixResponse;
  draft: { roleId: string; scopeKind: string; scopeCode: string };
  setDraft: React.Dispatch<React.SetStateAction<{ roleId: string; scopeKind: string; scopeCode: string }>>;
  onSave: () => void;
  onToggle: (scope: RoleScope, allowed: boolean) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <UserCog size={18} aria-hidden="true" />
        <strong>主管範圍設定</strong>
        <InfoMark text="用部門、專案與動作範圍限制主管待辦、通知與審核清單；未設定範圍時維持角色預設可視範圍。" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 220px) minmax(120px, 160px) 1fr auto", gap: "0.75rem", alignItems: "end" }}>
        <label style={labelStyle}>
          角色
          <select
            className="dropdown-select"
            data-testid="role-scope-role"
            value={draft.roleId}
            onChange={(event) => setDraft((current) => ({ ...current, roleId: event.target.value }))}
          >
            {matrix.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.title}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          範圍類型
          <select
            className="dropdown-select"
            data-testid="role-scope-kind"
            value={draft.scopeKind}
            onChange={(event) => setDraft((current) => ({ ...current, scopeKind: event.target.value }))}
          >
            <option value="department">部門</option>
            <option value="project">專案</option>
            <option value="action">動作</option>
          </select>
        </label>
        <label style={labelStyle}>
          範圍代碼
          <input
            data-testid="role-scope-code"
            list={draft.scopeKind === "action" ? "numbering-action-codes" : undefined}
            value={draft.scopeCode}
            onChange={(event) => setDraft((current) => ({ ...current, scopeCode: event.target.value }))}
            style={fieldStyle}
          />
        </label>
        <button className="secondary-button" type="button" onClick={onSave}>
          <Plus size={16} />
          新增範圍
        </button>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "720px" }}>
          <thead>
            <tr>
              <th>角色</th>
              <th>範圍類型</th>
              <th>範圍代碼</th>
              <th>狀態</th>
              <th>切換</th>
            </tr>
          </thead>
          <tbody>
            {matrix.roleScopes.map((scope) => (
              <tr key={scope.id}>
                <td>{matrix.roles.find((role) => role.id === scope.roleId)?.title ?? scope.roleId}</td>
                <td>{scopeKindLabel(scope.scopeKind)}</td>
                <td>{scope.scopeCode}</td>
                <td>{scope.allowed ? "啟用" : "停用"}</td>
                <td>
                  <button className="secondary-button" type="button" onClick={() => onToggle(scope, !scope.allowed)}>
                    {scope.allowed ? "停用" : "啟用"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DelegationPanel({
  matrix,
  draft,
  setDraft,
  onSave,
  onRevoke
}: {
  matrix: MatrixResponse;
  draft: { delegatedFrom: string; delegatedTo: string; projectCode: string; actionCode: string; startsAt: string; endsAt: string; reason: string };
  setDraft: React.Dispatch<React.SetStateAction<{ delegatedFrom: string; delegatedTo: string; projectCode: string; actionCode: string; startsAt: string; endsAt: string; reason: string }>>;
  onSave: () => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <Clock size={18} aria-hidden="true" />
        <strong>代理人設定</strong>
        <InfoMark text="代理人只能由管理員設定；代理審核會標示被代理人、代理人、專案、動作與時間區間。" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.75rem" }}>
        <label style={labelStyle}>
          被代理人
          <select
            className="dropdown-select"
            data-testid="delegation-from"
            value={draft.delegatedFrom}
            onChange={(event) => setDraft((current) => ({ ...current, delegatedFrom: event.target.value }))}
          >
            {matrix.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName} / {user.role}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          代理人
          <select
            className="dropdown-select"
            data-testid="delegation-to"
            value={draft.delegatedTo}
            onChange={(event) => setDraft((current) => ({ ...current, delegatedTo: event.target.value }))}
          >
            {matrix.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName} / {user.role}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          專案
          <input data-testid="delegation-project" value={draft.projectCode} onChange={(event) => setDraft((current) => ({ ...current, projectCode: event.target.value }))} style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          動作
          <input
            data-testid="delegation-action"
            list="numbering-action-codes"
            value={draft.actionCode}
            onChange={(event) => setDraft((current) => ({ ...current, actionCode: event.target.value }))}
            style={fieldStyle}
          />
        </label>
        <label style={labelStyle}>
          開始
          <input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          結束
          <input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} style={fieldStyle} />
        </label>
        <label style={labelStyle}>
          原因
          <input data-testid="delegation-reason" value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} style={fieldStyle} />
        </label>
      </div>
      <div>
        <button className="secondary-button" type="button" onClick={onSave}>
          <Save size={16} />
          儲存代理
        </button>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "900px" }}>
          <thead>
            <tr>
              <th>被代理人</th>
              <th>代理人</th>
              <th>範圍</th>
              <th>時間</th>
              <th>原因</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {matrix.approvalDelegations.map((delegation) => (
              <tr key={delegation.id}>
                <td>{delegation.delegatedFromName}</td>
                <td>{delegation.delegatedToName}</td>
                <td>
                  {delegation.projectCode ?? "全部專案"} / {delegation.actionCode ?? "全部動作"}
                </td>
                <td>
                  {(delegation.startsAt ? formatDateTime(delegation.startsAt) : "立即")} - {delegation.endsAt ? formatDateTime(delegation.endsAt) : "未設定"}
                </td>
                <td>{delegation.reason}</td>
                <td>{delegation.revokedAt ? `已撤銷 ${formatDateTime(delegation.revokedAt)}` : "啟用"}</td>
                <td>
                  <button className="secondary-button" type="button" disabled={Boolean(delegation.revokedAt)} onClick={() => onRevoke(delegation.id)}>
                    撤銷
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RuleVersionSummary({ versions }: { versions: RuleVersion[] }) {
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "720px" }}>
        <thead>
          <tr>
            <th>規則版本</th>
            <th>狀態</th>
            <th>生效時間</th>
            <th>退役時間</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.id}>
              <td>
                <strong>{version.ruleCode}</strong>
                <br />
                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{version.title}</span>
              </td>
              <td>{version.status}</td>
              <td>{formatDateTime(version.effectiveAt)}</td>
              <td>{version.retiredAt ? formatDateTime(version.retiredAt) : "未退役"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlagControls({
  draft,
  onChange
}: {
  draft: RuleDraft;
  onChange: <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.25rem", minWidth: "130px" }}>
      <label style={checkboxStyle}>
        <input type="checkbox" checked={draft.requiresApproval} onChange={(event) => onChange("requiresApproval", event.target.checked)} />
        審核
      </label>
      <label style={checkboxStyle}>
        <input type="checkbox" checked={draft.blocksUsage} onChange={(event) => onChange("blocksUsage", event.target.checked)} />
        阻擋使用
      </label>
      <label style={checkboxStyle}>
        <input type="checkbox" checked={draft.blocksRelease} onChange={(event) => onChange("blocksRelease", event.target.checked)} />
        阻擋發行
      </label>
    </div>
  );
}

function MarkerControls({
  draft,
  onChange
}: {
  draft: RuleDraft;
  onChange: <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.25rem", minWidth: "110px" }}>
      <label style={checkboxStyle}>
        <input type="checkbox" checked={draft.showsWarning} onChange={(event) => onChange("showsWarning", event.target.checked)} />
        警示
      </label>
      <label style={checkboxStyle}>
        <input type="checkbox" checked={draft.exportMarker} onChange={(event) => onChange("exportMarker", event.target.checked)} />
        匯出標示
      </label>
    </div>
  );
}

function MatrixSelect({
  value,
  options,
  labels,
  onChange
}: {
  value: string | null;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string | null) => void;
}) {
  return (
    <select className="dropdown-select" value={value ?? ""} onChange={(event) => onChange(emptyToNull(event.target.value))} style={{ width: "100%" }}>
      <option value="">不限</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}

function InfoMark({ text }: { text: string }) {
  return <InfoHint title={text} className="settings-info-marker" />;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function rolePermissionEnabled(matrix: MatrixResponse, roleId: string, permissionKind: "page" | "action", permissionCode: string) {
  return matrix.rolePermissions.some(
    (permission) => permission.roleId === roleId && permission.permissionKind === permissionKind && permission.permissionCode === permissionCode && permission.allowed
  );
}

function permissionLabel(code: string) {
  const labels: Record<string, string> = {
    "numbering.request": "申請",
    "numbering.search": "查詢",
    "numbering.drawings.view": "圖號模組",
    "numbering.dvt": "DVT",
    "numbering.approvals": "審核",
    "numbering.impact": "影響",
    "numbering.tasks": "待辦",
    "numbering.imports": "匯入",
    "numbering.reports": "報表",
    "settings.admin_matrix": "後台",
    "numbering.create": "建立號碼",
    "numbering.duplicate_check": "查重",
    "numbering.link_variant": "同圖連結",
    "numbering.dvt.submit": "送 DVT",
    "numbering.approval.request": "送審",
    "numbering.approval.batch.create": "建審核批次",
    "numbering.approval.batch.decide": "批次決議",
    "numbering.approval.batch.resubmit": "退回重送",
    "numbering.impact.analyze": "影響分析",
    "numbering.impact.apply": "套用作廢",
    "numbering.import.stage": "匯入 staging",
    "numbering.import.confirm": "確認匯入",
    "numbering.export.create": "匯出總表",
    "numbering.audit_report.generate": "產生月報",
    "numbering.task.update": "更新待辦",
    "numbering.notification.update": "更新通知",
    dvt_promotion: "DVT 晉升",
    dvt_missing_ma_override: "DVT 缺 MA",
    release: "發行",
    release_missing_ma_confirm: "發行缺 MA",
    same_drawing_variant_after_release: "發行後多料",
    main_drawing_restore: "恢復 MA",
    merge_part_number: "合併",
    obsolete_ma_drawing: "作廢 MA",
    obsolete_part_number: "作廢料號",
    post_release_change: "發行後異動",
    update_name: "改品名",
    update_spec: "改規格"
  };
  return labels[code] ?? code;
}

function scopeKindLabel(kind: RoleScope["scopeKind"]) {
  if (kind === "department") return "部門";
  if (kind === "project") return "專案";
  return "動作";
}

function formatBoolean(value: boolean) {
  return value ? "是" : "否";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { hour12: false });
}

const fieldStyle = {
  width: "100%",
  minHeight: "34px",
  border: "1px solid var(--line)",
  borderRadius: "6px",
  padding: "0 0.5rem"
} as const;

const labelStyle = {
  display: "grid",
  gap: "0.3rem",
  fontSize: "0.85rem"
} as const;

const checkboxStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.82rem",
  whiteSpace: "nowrap"
} as const;

function formatSettingValue(value: boolean | string) {
  if (typeof value === "boolean") return value ? "已設定" : "未設定";
  return value || "未設定";
}
