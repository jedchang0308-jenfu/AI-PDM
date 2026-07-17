"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Ban,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Folder,
  FolderOpen,
  Info,
  KeyRound,
  LockKeyhole,
  Play,
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
import { StatusBadge, StatusColumnHeader, StatusScopeHelp } from "@/components/status-help-popover";
import {
  approvalActionLabel,
  approvalItemKindLabel,
  approvalPhaseLabel,
  approvalRecordStatusLabel,
  approvalRiskFlagLabel,
  approvalRoleLabel,
  buildApprovalRuleSummary,
  withPredictedApprovalControls
} from "@/lib/approval-rule-summary";
import { formatStatusForUser } from "@/lib/status-display";

type SettingsState =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "unauthorized" }
  | { status: "ready"; settings: Record<string, boolean | string> }
  | { status: "error"; message: string };

export type SettingsArea = "overview" | "integrations" | "security" | "workflow" | "system";

const settingsAreas: Array<{ id: SettingsArea; label: string; href: string; hash: string }> = [
  { id: "overview", label: "總覽", href: "/settings", hash: "settings-overview" },
  { id: "integrations", label: "整合", href: "/settings/integrations", hash: "settings-integrations" },
  { id: "security", label: "安全", href: "/settings/security", hash: "settings-security" },
  { id: "workflow", label: "流程", href: "/settings/workflow", hash: "settings-workflow" },
  { id: "system", label: "系統", href: "/settings/system", hash: "settings-system" }
];

const SETTINGS_SECRET_MANAGEMENT_AVAILABLE = false;
const SETTINGS_SECRET_MANAGEMENT_UNOPENED_MESSAGE = "機密金鑰生命週期管理尚未納入目前開放範圍。";

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
  scopeTemplate: string;
  namedScope: string;
  sponsorUserId: string | null;
  startsAt: string | null;
  reviewDueAt: string | null;
  hardEndsAt: string | null;
  assignedBy: string;
  assignedAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
};

type AccessAuditEvent = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
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
  auditEvents: AccessAuditEvent[];
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

type WorkflowTab = "roles" | "user_access" | "external_specialists" | "audit";

type AssignmentDraft = {
  userId: string;
  roleId: string;
  scopeTemplate: string;
  namedScope: string;
  sponsorUserId: string;
  startsAt: string;
  reviewDueAt: string;
  hardEndsAt: string;
  reason: string;
};

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

type DriveFolderUse = "pending" | "released" | "master_attachments";

type SecretLifecycleStatus = "draft" | "tested" | "active" | "retired" | "revoked";

type RedactedSecretVersionSummary = {
  id: string;
  version: number;
  lifecycleStatus: SecretLifecycleStatus;
  vaultProvider: "local_test_double" | "supabase_vault";
  maskedHint: string;
  fingerprint: string;
  createdAt: string;
  testedAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
};

type SettingsSecretStatus = {
  kind: "solidworks_document_manager";
  provider: string;
  displayName: string;
  configured: boolean;
  active: RedactedSecretVersionSummary | null;
  latest: RedactedSecretVersionSummary | null;
  latestTestRun: {
    id: string;
    resultStatus: "passed" | "failed" | "blocked";
    summary: string;
    redactedError: string | null;
    testedAt: string;
  } | null;
  draftCount: number;
  testedCount: number;
  revokedCount: number;
  workQueueState: "missing" | "draft_needs_test" | "tested_needs_activation" | "ready" | "revoked";
  workQueueMessage: string;
  liveGate: {
    provider: "local_test_double" | "supabase_vault";
    status: "mocked" | "blocked" | "ready";
    message: string;
  };
};

const emptyRuleDraft: RuleDraft = {
  ruleVersionId: "numbering-rule-v3-alpha-root",
  ruleName: "",
  actionCode: "",
  phase: null,
  recordStatus: null,
  itemKind: null,
  riskFlag: null,
  requiresApproval: false,
  approverRole: null,
  blocksUsage: false,
  blocksRelease: true,
  showsWarning: true,
  exportMarker: true
};

const scopeTemplateOptions = [
  { value: "own_department", label: "所屬部門", detail: "適合研發工程師與研發主管，使用部門作為預設工作範圍。" },
  { value: "workspace_quality", label: "品質工作視圖", detail: "適合品保，由 PDM 管理員或系統管理員授權的品質檢視範圍。" },
  { value: "released_only", label: "正式資料限定", detail: "適合製造與採購，只看已發布資料。" },
  { value: "named_scope", label: "指定範圍", detail: "適合外部專員、跨部門支援或專案/產品/客戶限定。" },
  { value: "self", label: "本人資料", detail: "只限本人建立或負責的資料。" }
] as const;

function defaultReviewDueDateFromToday() {
  const date = new Date();
  date.setDate(date.getDate() + 90);
  return date.toISOString().slice(0, 10);
}

export default function SettingsPage() {
  return <SettingsScreen initialArea="overview" />;
}

export function SettingsScreen({ initialArea }: { initialArea: SettingsArea }) {
  const [state, setState] = useState<SettingsState>({ status: "loading" });
  const [activeArea, setActiveArea] = useState<SettingsArea>(initialArea);

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

  useEffect(() => {
    function syncLegacyHash() {
      const hash = window.location.hash.replace(/^#/, "");
      const area = settingsAreas.find((item) => item.hash === hash)?.id;
      if (area) setActiveArea(area);
    }

    syncLegacyHash();
    window.addEventListener("hashchange", syncLegacyHash);
    return () => window.removeEventListener("hashchange", syncLegacyHash);
  }, []);

  const activeAreaLabel = settingsAreas.find((area) => area.id === activeArea)?.label ?? "總覽";

  return (
    <>
      <div className="topbar">
        <div>
          <h1>系統設定 <StatusScopeHelp scope="settingsCenter" /></h1>
          <p>目前位於「{activeAreaLabel}」；請從分頁切換要管理的設定區域。</p>
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
      {state.status === "ready" ? <SettingsPanel settings={state.settings} activeArea={activeArea} onSaved={fetchSettings} /> : null}
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

function SettingsPanel({
  settings,
  activeArea,
  onSaved
}: {
  settings: Record<string, boolean | string>;
  activeArea: SettingsArea;
  onSaved: () => void;
}) {
  const [pendingFolder, setPendingFolder] = useState(String(settings.gdrive_pending_folder_id ?? ""));
  const [releasedFolder, setReleasedFolder] = useState(String(settings.gdrive_released_folder_id ?? ""));
  const [masterAttachmentsFolder, setMasterAttachmentsFolder] = useState(String(settings.gdrive_master_attachments_folder_id ?? ""));
  const [pendingSnapshot, setPendingSnapshot] = useState<VerifiedFolderSnapshot | null>(() => snapshotFromSettings(settings, "pending"));
  const [releasedSnapshot, setReleasedSnapshot] = useState<VerifiedFolderSnapshot | null>(() => snapshotFromSettings(settings, "released"));
  const [masterAttachmentsSnapshot, setMasterAttachmentsSnapshot] = useState<VerifiedFolderSnapshot | null>(() => snapshotFromSettings(settings, "master_attachments"));
  const [selectedFolder, setSelectedFolder] = useState<GDriveFolderNode | null>(null);
  const [childrenByParent, setChildrenByParent] = useState<Record<string, FolderChildrenState>>({ root: { status: "idle" } });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ root: true });
  const [loading, setLoading] = useState(false);
  const [folderLoading, setFolderLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [secretStatuses, setSecretStatuses] = useState<SettingsSecretStatus[]>([]);
  const [secretLoading, setSecretLoading] = useState(false);
  const [secretAction, setSecretAction] = useState<string | null>(null);
  const [solidWorksSecret, setSolidWorksSecret] = useState("");
  const [secretMessage, setSecretMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (settings.serviceAccountConfigured) {
      loadFolderChildren("root");
    } else {
      setChildrenByParent({ root: { status: "error", message: "Google Drive 服務帳號尚未設定" } });
    }
  }, [settings.serviceAccountConfigured]);

  useEffect(() => {
    if (SETTINGS_SECRET_MANAGEMENT_AVAILABLE) {
      void loadSecretStatuses();
    }
  }, []);

  async function loadSecretStatuses() {
    if (!SETTINGS_SECRET_MANAGEMENT_AVAILABLE) return;
    setSecretLoading(true);
    try {
      const response = await fetch("/api/settings/secrets");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? body.error ?? "機密設定狀態讀取失敗");
      setSecretStatuses(body.secrets ?? []);
    } catch (error) {
      setSecretMessage({ type: "error", text: error instanceof Error ? error.message : "機密設定狀態讀取失敗" });
    } finally {
      setSecretLoading(false);
    }
  }

  async function createSolidWorksSecretDraft(e: React.FormEvent) {
    e.preventDefault();
    setSecretAction("draft");
    setSecretMessage(null);
    try {
      const response = await fetch("/api/settings/secrets/solidworks_document_manager/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secretValue: solidWorksSecret })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? body.error ?? "建立金鑰草稿失敗");
      setSecretStatuses(body.secrets ?? []);
      setSolidWorksSecret("");
      setSecretMessage({ type: "success", text: "SolidWorks 金鑰草稿已建立，請接續測試後再啟用。" });
    } catch (error) {
      setSecretMessage({ type: "error", text: error instanceof Error ? error.message : "建立金鑰草稿失敗" });
    } finally {
      setSecretAction(null);
    }
  }

  async function runSecretAction(secretReferenceId: string, action: "test" | "activate" | "revoke") {
    setSecretAction(`${action}:${secretReferenceId}`);
    setSecretMessage(null);
    const body = action === "revoke" ? { reason: "Revoked from settings center UI" } : {};
    try {
      const response = await fetch(`/api/settings/secrets/${encodeURIComponent(secretReferenceId)}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? result.error ?? "機密設定操作失敗");
      setSecretStatuses(result.secrets ?? []);
      const labels = { test: "測試完成", activate: "啟用完成", revoke: "撤銷完成" } as const;
      setSecretMessage({ type: "success", text: labels[action] });
    } catch (error) {
      setSecretMessage({ type: "error", text: error instanceof Error ? error.message : "機密設定操作失敗" });
    } finally {
      setSecretAction(null);
    }
  }

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

  async function verifyAndAssign(use: DriveFolderUse, folder = selectedFolder) {
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
    } else if (use === "released") {
      setReleasedFolder(snapshot.id);
      setReleasedSnapshot(snapshot);
    } else {
      setMasterAttachmentsFolder(snapshot.id);
      setMasterAttachmentsSnapshot(snapshot);
    }
    setMessage({ type: "success", text: `${snapshot.name} 已驗證並指定為${folderUseLabel(use)}` });
  }

  async function verifyManualFolder(use: DriveFolderUse) {
    const folderId = use === "pending" ? pendingFolder : use === "released" ? releasedFolder : masterAttachmentsFolder;
    if (!folderId.trim()) {
      setMessage({ type: "error", text: "請先輸入資料夾 ID" });
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
      setMessage({ type: "error", text: "審核中暫存區與正式發布區不可指向同一個資料夾" });
      return;
    }
    const configuredFolders = [pendingFolder, releasedFolder, masterAttachmentsFolder].map((folderId) => folderId.trim()).filter(Boolean);
    if (new Set(configuredFolders).size !== configuredFolders.length) {
      setLoading(false);
      setMessage({ type: "error", text: "三個 Google Drive 用途資料夾不可重複指定" });
      return;
    }
    if ((pendingFolder && !pendingSnapshot) || (releasedFolder && !releasedSnapshot) || (masterAttachmentsFolder && !masterAttachmentsSnapshot)) {
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
        gdrive_master_attachments_folder_id: masterAttachmentsFolder,
        ...folderSnapshotPayload("master_attachments", masterAttachmentsSnapshot),
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
    ([key]) =>
      !key.startsWith("gdrive_pending_folder_") &&
      !key.startsWith("gdrive_released_folder_") &&
      !key.startsWith("gdrive_master_attachments_folder_")
  );
  const selectedSnapshot =
    selectedFolder && pendingSnapshot?.id === selectedFolder.id
      ? pendingSnapshot
      : selectedFolder && releasedSnapshot?.id === selectedFolder.id
        ? releasedSnapshot
        : selectedFolder && masterAttachmentsSnapshot?.id === selectedFolder.id
          ? masterAttachmentsSnapshot
          : null;
  const selectedUse: DriveFolderUse =
    selectedFolder?.id === releasedFolder ? "released" : selectedFolder?.id === masterAttachmentsFolder ? "master_attachments" : "pending";
  const solidWorksStatus = secretStatuses.find((status) => status.kind === "solidworks_document_manager") ?? emptySolidWorksSecretStatus();
  const googleDriveReady = Boolean(pendingSnapshot && releasedSnapshot && masterAttachmentsSnapshot);

  return (
    <div className="settings-center-shell">
      <SettingsAreaNav activeArea={activeArea} />

      <div className="settings-center-page">
        {activeArea === "overview" ? (
          <SettingsCenterOverview
            solidWorksStatus={solidWorksStatus}
            googleDriveReady={googleDriveReady}
            vaultProvider={solidWorksStatus.liveGate.provider}
            secretManagementAvailable={SETTINGS_SECRET_MANAGEMENT_AVAILABLE}
          />
        ) : null}

        {activeArea === "security" ? (
          <SolidWorksSecretPanel
            status={solidWorksStatus}
            secretValue={solidWorksSecret}
            loading={secretLoading}
            action={secretAction}
            message={secretMessage}
            available={SETTINGS_SECRET_MANAGEMENT_AVAILABLE}
            onSecretValueChange={setSolidWorksSecret}
            onCreateDraft={createSolidWorksSecretDraft}
            onRefresh={loadSecretStatuses}
            onRunAction={runSecretAction}
          />
        ) : null}

        {activeArea === "integrations" ? <section className="panel" id="settings-integrations">
        <div className="panel-header">
          <h2>Google Drive 設定</h2>
        </div>
        <form onSubmit={submit} style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="settings-drive-status">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              服務帳號：{settings.serviceAccountConfigured ? "已設定，可瀏覽 Google Drive" : "未設定，請先設定 GOOGLE_SERVICE_ACCOUNT_KEY_PATH"}
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
                  <p>{selectedFolder ? "請驗證後指定用途，再儲存設定。" : "從左側資料夾樹選取審核中暫存區或正式發布區。"}</p>
                </div>
                {selectedFolder ? (
                  <div className="settings-drive-detail-actions">
                    <a className="secondary-button" href={selectedFolder.webViewLink} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      開啟 Google Drive
                    </a>
                    <button className="secondary-button" type="button" onClick={() => navigator.clipboard?.writeText(selectedFolder.id)}>
                      <Copy size={16} />
                      複製資料夾 ID
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
                    <span>資料夾 ID</span>
                    <strong>{selectedFolder.id}</strong>
                  </div>
                  <div>
                    <span>Drive 類型</span>
                    <strong>{selectedFolder.driveId ? "共用雲端硬碟" : "我的雲端硬碟 / 根目錄"}</strong>
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
                  設為審核中暫存區
                </button>
                <button className="secondary-button" type="button" disabled={!selectedFolder || loading} onClick={() => verifyAndAssign("released")}>
                  設為正式發布區
                </button>
                <button className="secondary-button" type="button" disabled={!selectedFolder || loading} onClick={() => verifyAndAssign("master_attachments")}>
                  設為主檔附件庫
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!selectedFolder || loading}
                  onClick={() => {
                    if (!selectedFolder) return;
                    verifyAndAssign(selectedUse, selectedFolder);
                  }}
                >
                  <RefreshCw size={16} />
                  重新驗證權限
                </button>
              </div>
            </div>
          </div>

          <div className="settings-drive-summary">
            <FolderAssignmentCard title="審核中暫存區" folderId={pendingFolder} snapshot={pendingSnapshot} />
            <FolderAssignmentCard title="正式發布區" folderId={releasedFolder} snapshot={releasedSnapshot} />
          </div>

          <div className="settings-drive-summary">
            <FolderAssignmentCard title="主檔附件庫" folderId={masterAttachmentsFolder} snapshot={masterAttachmentsSnapshot} />
          </div>

          <details className="settings-drive-manual">
            <summary>進階：手動貼資料夾 ID</summary>
            <div className="settings-drive-manual-grid">
              <label style={labelStyle}>
                審核中資料夾 ID
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
            <div className="settings-drive-manual-grid">
              <label style={labelStyle}>
                主檔附件庫資料夾 ID
                <input
                  value={masterAttachmentsFolder}
                  onChange={(e) => {
                    setMasterAttachmentsFolder(e.target.value);
                    setMasterAttachmentsSnapshot(null);
                  }}
                  placeholder="貼上主檔附件庫 Google Drive 資料夾 ID"
                  style={fieldStyle}
                />
                <button className="secondary-button" type="button" onClick={() => verifyManualFolder("master_attachments")} disabled={loading}>
                  驗證此 ID
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
        </section> : null}

        {activeArea === "workflow" ? <div id="settings-workflow">
          <ApprovalMatrixSettings />
        </div> : null}

        {activeArea === "system" ? <section className="panel" id="settings-system">
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
        </section> : null}
      </div>
    </div>
  );
}

function emptySolidWorksSecretStatus(): SettingsSecretStatus {
  return {
    kind: "solidworks_document_manager",
    provider: "solidworks_document_manager",
    displayName: "SolidWorks Document Manager API 金鑰",
    configured: false,
    active: null,
    latest: null,
    latestTestRun: null,
    draftCount: 0,
    testedCount: 0,
    revokedCount: 0,
    workQueueState: "missing",
    workQueueMessage: "尚未建立 SolidWorks CAD 讀取金鑰草稿。",
    liveGate: {
      provider: "local_test_double",
      status: "mocked",
      message: "目前使用本機測試替身；正式啟用前需補 Supabase Vault 實際連線驗證。"
    }
  };
}

function ApprovalRuleSummaryDisplay({
  summary,
  muted = false,
  title,
  "data-testid": testId
}: {
  summary: string;
  muted?: boolean;
  title: string;
  "data-testid": string;
}) {
  const splitAt = summary.indexOf("處理：");
  const situation = splitAt >= 0 ? summary.slice(0, splitAt).trim() : summary;
  const outcome = splitAt >= 0 ? summary.slice(splitAt).trim() : "";

  return (
    <span
      data-testid={testId}
      title={title}
      aria-label={summary}
      style={{
        display: "grid",
        gap: "0.25rem",
        minWidth: "260px",
        maxWidth: "360px",
        lineHeight: 1.45,
        color: muted ? "var(--muted)" : "var(--text)",
        wordBreak: "break-word"
      }}
    >
      <span>{situation}</span>
      {outcome ? <span>{outcome}</span> : null}
    </span>
  );
}

function SettingsAreaNav({ activeArea }: { activeArea: SettingsArea }) {
  return (
    <nav className="settings-center-nav" aria-label="設定區域">
      {settingsAreas.map((area) => (
        <Link
          className={activeArea === area.id ? "is-active" : undefined}
          href={area.href}
          aria-current={activeArea === area.id ? "page" : undefined}
          key={area.id}
        >
          {area.label}
        </Link>
      ))}
    </nav>
  );
}

function SettingsCenterOverview({
  solidWorksStatus,
  googleDriveReady,
  vaultProvider,
  secretManagementAvailable
}: {
  solidWorksStatus: SettingsSecretStatus;
  googleDriveReady: boolean;
  vaultProvider: "local_test_double" | "supabase_vault";
  secretManagementAvailable: boolean;
}) {
  return (
    <section className="panel" id="settings-overview">
      <div className="panel-header">
        <div>
          <h2>設定中心</h2>
          <p>工作佇列與高風險設定狀態。</p>
        </div>
      </div>
      <div className="settings-center-grid">
        <SettingsStatusTile
          icon={solidWorksStatus.configured ? <CheckCircle2 size={18} /> : <KeyRound size={18} />}
          title="SolidWorks CAD 讀取器"
          status={secretManagementAvailable ? settingWorkQueueLabel(solidWorksStatus.workQueueState) : "未開放"}
          detail={secretManagementAvailable ? solidWorksStatus.workQueueMessage : SETTINGS_SECRET_MANAGEMENT_UNOPENED_MESSAGE}
          href="/settings/security"
          actionLabel={secretManagementAvailable ? "前往安全設定" : "查看未開放功能"}
        />
        <SettingsStatusTile
          icon={googleDriveReady ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
          title="Google Drive"
          status={googleDriveReady ? "已驗證" : "待設定"}
          detail={googleDriveReady ? "三個用途資料夾皆有驗證快照。" : "審核中、發布與主檔附件庫需各自驗證。"}
          href="/settings/integrations"
          actionLabel="管理整合設定"
        />
        <SettingsStatusTile
          icon={vaultProvider === "supabase_vault" ? <LockKeyhole size={18} /> : <Ban size={18} />}
          title="機密資料保管庫"
          status={secretManagementAvailable ? (solidWorksStatus.liveGate.status === "ready" ? "已連到保管庫" : "待正式驗證") : "未開放"}
          detail={secretManagementAvailable ? solidWorksStatus.liveGate.message : SETTINGS_SECRET_MANAGEMENT_UNOPENED_MESSAGE}
          href="/settings/security"
          actionLabel={secretManagementAvailable ? "查看安全狀態" : "查看未開放功能"}
        />
      </div>
    </section>
  );
}

function SettingsStatusTile({
  icon,
  title,
  status,
  detail,
  href,
  actionLabel
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  detail: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="settings-status-tile">
      <div className="settings-status-tile-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <span>{title}</span>
        <strong>{status}</strong>
        <small>{detail}</small>
        <Link className="settings-status-tile-action" href={href}>
          {actionLabel}
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function SolidWorksSecretPanel({
  status,
  secretValue,
  loading,
  action,
  message,
  available,
  onSecretValueChange,
  onCreateDraft,
  onRefresh,
  onRunAction
}: {
  status: SettingsSecretStatus;
  secretValue: string;
  loading: boolean;
  action: string | null;
  message: { type: "error" | "success"; text: string } | null;
  available: boolean;
  onSecretValueChange: (value: string) => void;
  onCreateDraft: (event: React.FormEvent) => void;
  onRefresh: () => void;
  onRunAction: (secretReferenceId: string, action: "test" | "activate" | "revoke") => void;
}) {
  const latest = status.latest;
  const active = status.active;
  const canTest = latest ? latest.lifecycleStatus === "draft" || latest.lifecycleStatus === "tested" : false;
  const canActivate = latest?.lifecycleStatus === "tested";
  const busy = Boolean(action) || loading;
  const unavailableTitle = `未開放：${SETTINGS_SECRET_MANAGEMENT_UNOPENED_MESSAGE}`;

  return (
    <section className="panel" id="settings-security">
      <div className="panel-header">
        <div>
          <h2>安全設定 {!available ? <span className="nav-unopened-badge">未開放</span> : null}</h2>
          <p>金鑰流程：建立草稿、測試、啟用、撤銷。</p>
        </div>
        <button className="secondary-button" type="button" onClick={onRefresh} disabled={!available || busy} title={!available ? unavailableTitle : "重新整理金鑰狀態"}>
          <RefreshCw size={16} />
          重新整理
        </button>
      </div>

      <div className="settings-secret-layout">
        <form className="settings-secret-form" onSubmit={onCreateDraft}>
          <div className="settings-secret-heading">
            <KeyRound size={18} aria-hidden="true" />
            <div>
              <h3>SolidWorks Document Manager</h3>
              <p>{status.workQueueMessage}</p>
            </div>
          </div>
          <label style={labelStyle}>
            API / 授權金鑰
            <input
              type="password"
              autoComplete="new-password"
              value={secretValue}
              onChange={(event) => onSecretValueChange(event.target.value)}
              disabled={!available}
              title={!available ? unavailableTitle : undefined}
              placeholder="貼上新的 SolidWorks 金鑰"
              style={fieldStyle}
            />
          </label>
          <div className="settings-secret-actions">
            <button className="primary-button" type="submit" disabled={!available || busy || !secretValue.trim()} title={!available ? unavailableTitle : undefined}>
              <KeyRound size={16} />
              {action === "draft" ? "建立中..." : "建立草稿"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!available || busy || !latest || !canTest}
              title={!available ? unavailableTitle : undefined}
              onClick={() => {
                if (latest) onRunAction(latest.id, "test");
              }}
            >
              <Play size={16} />
              測試最新版本
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!available || busy || !latest || !canActivate}
              title={!available ? unavailableTitle : undefined}
              onClick={() => {
                if (latest) onRunAction(latest.id, "activate");
              }}
            >
              <ShieldCheck size={16} />
              啟用已測試版本
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!available || busy || !active}
              title={!available ? unavailableTitle : undefined}
              onClick={() => {
                if (active) onRunAction(active.id, "revoke");
              }}
            >
              <Ban size={16} />
              撤銷目前啟用版本
            </button>
          </div>
          {message ? <div className={`settings-secret-message is-${message.type}`}>{message.text}</div> : null}
        </form>

        <div className="settings-secret-status">
          <SecretVersionDetails title="目前啟用版本" version={active} emptyText="尚未啟用" />
          <SecretVersionDetails title="最新版本" version={latest} emptyText="尚未建立草稿" />
          <div className="settings-secret-test-run">
            <span>最近測試</span>
            <strong>{!available ? "未開放" : status.latestTestRun ? secretTestStatusLabel(status.latestTestRun.resultStatus) : "尚未測試"}</strong>
            <small>{!available ? SETTINGS_SECRET_MANAGEMENT_UNOPENED_MESSAGE : status.latestTestRun ? `${formatDateTime(status.latestTestRun.testedAt)} / ${status.latestTestRun.summary}` : status.liveGate.message}</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function SecretVersionDetails({
  title,
  version,
  emptyText
}: {
  title: string;
  version: RedactedSecretVersionSummary | null;
  emptyText: string;
}) {
  return (
    <div className="settings-secret-version">
      <span>{title}</span>
      <strong>{version ? `v${version.version} / ${secretLifecycleLabel(version.lifecycleStatus)}` : emptyText}</strong>
      <small>
        {version
          ? `${version.vaultProvider === "supabase_vault" ? "Supabase Vault" : "本機測試替身"} / ${version.maskedHint} / ${formatDateTime(version.createdAt)}`
          : "未設定"}
      </small>
    </div>
  );
}

function settingWorkQueueLabel(state: SettingsSecretStatus["workQueueState"]) {
  const labels: Record<SettingsSecretStatus["workQueueState"], string> = {
    missing: "未設定",
    draft_needs_test: "待測試",
    tested_needs_activation: "待啟用",
    ready: "可使用",
    revoked: "已停用"
  };
  return labels[state];
}

function secretLifecycleLabel(status: SecretLifecycleStatus) {
  const labels: Record<SecretLifecycleStatus, string> = {
    draft: "草稿",
    tested: "已測試",
    active: "啟用",
    retired: "退役",
    revoked: "撤銷"
  };
  return labels[status];
}

function secretTestStatusLabel(status: "passed" | "failed" | "blocked") {
  if (status === "passed") return "通過";
  if (status === "blocked") return "阻擋";
  return "失敗";
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

function snapshotFromSettings(settings: Record<string, boolean | string>, use: DriveFolderUse): VerifiedFolderSnapshot | null {
  const id = String(settings[`gdrive_${use}_folder_id`] ?? "").trim();
  const name = String(settings[`gdrive_${use}_folder_name`] ?? "").trim();
  const path = String(settings[`gdrive_${use}_folder_path`] ?? "").trim();
  const verifiedAt = String(settings[`gdrive_${use}_folder_verified_at`] ?? "").trim();
  if (!id || !name || !path || !verifiedAt) return null;
  return { id, name, path, verifiedAt };
}

function folderSnapshotPayload(use: DriveFolderUse, snapshot: VerifiedFolderSnapshot | null) {
  return {
    [`gdrive_${use}_folder_name`]: snapshot?.name ?? "",
    [`gdrive_${use}_folder_path`]: snapshot?.path ?? "",
    [`gdrive_${use}_folder_verified_at`]: snapshot?.verifiedAt ?? ""
  };
}

function folderUseLabel(use: DriveFolderUse) {
  if (use === "pending") return "審核中暫存區";
  if (use === "released") return "正式發布區";
  return "主檔附件庫";
}

export function ApprovalMatrixSettings() {
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [newRule, setNewRule] = useState<RuleDraft>(emptyRuleDraft);
  const [newRole, setNewRole] = useState({ roleCode: "", title: "" });
  const [priorityText, setPriorityText] = useState("");
  const [priorityReason, setPriorityReason] = useState("");
  const [scopeDraft, setScopeDraft] = useState({ roleId: "role-rd-manager", scopeKind: "project", scopeCode: "" });
  const [assignmentDraft, setAssignmentDraft] = useState({
    userId: "",
    roleId: "",
    scopeTemplate: "own_department",
    namedScope: "",
    sponsorUserId: "",
    startsAt: "",
    reviewDueAt: "",
    hardEndsAt: "",
    reason: ""
  });
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
  const [activeTab, setActiveTab] = useState<WorkflowTab>("roles");

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
          roleId: current.roleId || nextMatrix.roles.find((role) => !role.systemDefined)?.id || nextMatrix.roles.find((role) => role.roleCode === "qa")?.id || nextMatrix.roles[0]?.id || "",
          scopeTemplate: current.scopeTemplate || "own_department",
          reviewDueAt: current.reviewDueAt || defaultReviewDueDateFromToday()
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
    const predictedRule = withPredictedApprovalControls(rule);
    setSavingRuleId(ruleId);
    setMessage(null);
    const response = await fetch("/api/numbering/admin/matrix", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...predictedRule, ruleName: buildApprovalRuleSummary(predictedRule) })
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
      {
        operation: "role_assignment",
        userId: assignmentDraft.userId,
        roleId: assignmentDraft.roleId,
        scopeTemplate: assignmentDraft.scopeTemplate,
        namedScope: assignmentDraft.namedScope,
        sponsorUserId: assignmentDraft.sponsorUserId,
        startsAt: assignmentDraft.startsAt,
        reviewDueAt: assignmentDraft.reviewDueAt,
        hardEndsAt: assignmentDraft.hardEndsAt,
        reason: assignmentDraft.reason
      },
      "使用者角色指派已更新"
    );
    if (ok) setAssignmentDraft((current) => ({ ...current, namedScope: "", hardEndsAt: "", reason: "" }));
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
      <section className="panel" data-testid="approval-matrix-panel">
        <div className="panel-header">
          <h2>審核矩陣設定台</h2>
        </div>
        <div className="empty">正在載入審核矩陣...</div>
      </section>
    );
  }

  if (!matrix) {
    return (
      <section className="panel" data-testid="approval-matrix-panel">
        <div className="panel-header">
          <h2>審核矩陣設定台</h2>
        </div>
        <div className="empty">{message?.text ?? "審核矩陣讀取失敗"}</div>
      </section>
    );
  }

  return (
    <section className="panel" data-testid="approval-matrix-panel">
      <div className="panel-header">
        <div>
          <h2>審核矩陣設定台</h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            規則版本：{ruleVersionLabel(matrix.ruleVersionId)}
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

        <WorkflowWorkspaceBanner />
        <WorkflowTabBar activeTab={activeTab} onChange={setActiveTab} />
        <AccessGovernanceSummary matrix={matrix} />

        {activeTab === "roles" ? (
          <div style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <strong>規則模板</strong>
            <InfoMark text="模板會批次更新一般審核規則；編號唯一、主要製造圖等硬性限制不會被模板關閉。" />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {matrix.ruleTemplates.map((template) => (
              <button
                className="secondary-button"
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template.templateCode)}
                disabled={savingRuleId === `template-${template.templateCode}`}
                title={ruleTemplateDescription(template.templateCode, template.description)}
              >
                <SlidersHorizontal size={16} />
                {template.title}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table style={{ minWidth: "1320px" }}>
            <thead>
              <tr>
                <th>規則摘要</th>
                <th>觸發動作</th>
                <th>階段</th>
                <th>
                  <StatusColumnHeader context="masterRecord" />
                </th>
                <th>料件</th>
                <th>風險</th>
                <th>審核角色</th>
                <th>是否需要審核</th>
                <th>標示方式</th>
                <th>儲存</th>
              </tr>
            </thead>
            <tbody>
              {matrix.approvalRules.map((rule) => {
                const draft = drafts[rule.id] ?? { ...rule };
                const predictedDraft = withPredictedApprovalControls(draft);
                const ruleSummary = buildApprovalRuleSummary(predictedDraft);
                return (
                  <tr key={rule.id}>
                    <td>
                      <ApprovalRuleSummaryDisplay
                        data-testid="approval-rule-summary"
                        summary={ruleSummary}
                        title="由觸發動作、適用條件、控制方式與審核角色自動產生，不需手動命名。"
                      />
                    </td>
                    <td>
                      <MatrixSelect
                        testId="approval-rule-action"
                        value={draft.actionCode}
                        options={matrix.options.actionCodes}
                        labels={labelsFor(matrix.options.actionCodes, actionCodeLabel)}
                        emptyLabel="請選擇動作"
                        minWidth="190px"
                        onChange={(value) => updateDraft(rule.id, "actionCode", value ?? "")}
                      />
                    </td>
                    <td>
                      <MatrixSelect
                        testId="approval-rule-phase"
                        value={draft.phase}
                        options={matrix.options.phases}
                        labels={labelsFor(matrix.options.phases, phaseLabel)}
                        minWidth="120px"
                        onChange={(value) => updateDraft(rule.id, "phase", value)}
                      />
                    </td>
                    <td>
                      <MatrixSelect
                        testId="approval-rule-status"
                        value={draft.recordStatus}
                        options={matrix.options.recordStatuses}
                        labels={labelsFor(matrix.options.recordStatuses, recordStatusLabel)}
                        minWidth="150px"
                        onChange={(value) => updateDraft(rule.id, "recordStatus", value)}
                      />
                    </td>
                    <td>
                      <MatrixSelect
                        testId="approval-rule-item-kind"
                        value={draft.itemKind}
                        options={matrix.options.itemKinds}
                        labels={labelsFor(matrix.options.itemKinds, itemKindLabel)}
                        minWidth="130px"
                        onChange={(value) => updateDraft(rule.id, "itemKind", value)}
                      />
                    </td>
                    <td>
                      <MatrixSelect
                        testId="approval-rule-risk"
                        value={draft.riskFlag ?? ""}
                        options={matrix.options.riskFlags}
                        labels={labelsFor(matrix.options.riskFlags, riskFlagLabel)}
                        emptyLabel="不指定"
                        minWidth="160px"
                        onChange={(value) => updateDraft(rule.id, "riskFlag", value)}
                      />
                    </td>
                    <td>
                      <MatrixSelect
                        value={draft.approverRole}
                        options={matrix.roles.map((role) => role.roleCode)}
                        labels={Object.fromEntries(matrix.roles.map((role) => [role.roleCode, role.title]))}
                        minWidth="130px"
                        onChange={(value) => updateDraft(rule.id, "approverRole", value)}
                      />
                    </td>
                    <td>
                      <ReviewControls draft={draft} onChange={(key, value) => updateDraft(rule.id, key, value)} />
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
                  <ApprovalRuleSummaryDisplay
                    data-testid="approval-new-rule-summary"
                    summary={newRule.actionCode ? buildApprovalRuleSummary(withPredictedApprovalControls(newRule)) : "選擇觸發動作與條件後自動產生"}
                    muted
                    title="新增時不需要手動命名；儲存後系統會依條件產生摘要。"
                  />
                </td>
                <td>
                  <MatrixSelect
                    testId="approval-new-rule-action"
                    value={newRule.actionCode}
                    options={matrix.options.actionCodes}
                    labels={labelsFor(matrix.options.actionCodes, actionCodeLabel)}
                    emptyLabel="請選擇動作"
                    minWidth="190px"
                    onChange={(value) => updateNewRule("actionCode", value ?? "")}
                  />
                </td>
                <td>
                  <MatrixSelect
                    value={newRule.phase}
                    options={matrix.options.phases}
                    labels={labelsFor(matrix.options.phases, phaseLabel)}
                    minWidth="120px"
                    onChange={(value) => updateNewRule("phase", value)}
                  />
                </td>
                <td>
                  <MatrixSelect
                    value={newRule.recordStatus}
                    options={matrix.options.recordStatuses}
                    labels={labelsFor(matrix.options.recordStatuses, recordStatusLabel)}
                    minWidth="150px"
                    onChange={(value) => updateNewRule("recordStatus", value)}
                  />
                </td>
                <td>
                  <MatrixSelect
                    value={newRule.itemKind}
                    options={matrix.options.itemKinds}
                    labels={labelsFor(matrix.options.itemKinds, itemKindLabel)}
                    minWidth="130px"
                    onChange={(value) => updateNewRule("itemKind", value)}
                  />
                </td>
                <td>
                  <MatrixSelect
                    value={newRule.riskFlag ?? ""}
                    options={matrix.options.riskFlags}
                    labels={labelsFor(matrix.options.riskFlags, riskFlagLabel)}
                    emptyLabel="不指定"
                    minWidth="160px"
                    onChange={(value) => updateNewRule("riskFlag", value)}
                  />
                </td>
                <td>
                  <MatrixSelect
                    value={newRule.approverRole}
                    options={matrix.roles.map((role) => role.roleCode)}
                    labels={Object.fromEntries(matrix.roles.map((role) => [role.roleCode, role.title]))}
                    minWidth="130px"
                    onChange={(value) => updateNewRule("approverRole", value)}
                  />
                </td>
                <td>
                  <ReviewControls draft={newRule} onChange={updateNewRule} />
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

        <div className="table-wrap">
          <table style={{ minWidth: "760px" }}>
            <thead>
              <tr>
                <th>不可關閉硬限制</th>
                <th>審核</th>
                <th>禁止工作中使用</th>
                <th>禁止正式發行</th>
                <th>畫面提醒</th>
                <th>匯出標示</th>
              </tr>
            </thead>
            <tbody>
              {matrix.hardRules.map((rule) => (
                <tr key={rule.code}>
                  <td>
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      <ShieldCheck size={15} aria-hidden="true" />
                      {hardRuleLabel(rule.code)}
                      <InfoMark text={hardRuleMessageLabel(rule.code, rule.message)} />
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
        <RolePriorityPanel
          matrix={matrix}
          priorityText={priorityText}
          setPriorityText={setPriorityText}
          priorityReason={priorityReason}
          setPriorityReason={setPriorityReason}
          onSave={saveRolePriority}
        />
        <RoleScopePanel matrix={matrix} draft={scopeDraft} setDraft={setScopeDraft} onSave={addRoleScope} onToggle={toggleRoleScope} />
        <RuleVersionSummary versions={matrix.ruleVersions} />
        <RuleSimulator matrix={matrix} />
          </div>
        ) : null}

        {activeTab === "user_access" ? (
          <>
            <RoleAssignmentPanel
              matrix={matrix}
              draft={assignmentDraft}
              setDraft={setAssignmentDraft}
              onSave={saveRoleAssignment}
              onRevoke={revokeRoleAssignment}
            />
            <DelegationPanel matrix={matrix} draft={delegationDraft} setDraft={setDelegationDraft} onSave={saveDelegation} onRevoke={revokeDelegation} />
          </>
        ) : null}

        {activeTab === "external_specialists" ? <ExternalSpecialistsPanel matrix={matrix} /> : null}
        {activeTab === "audit" ? <AccessAuditPanel matrix={matrix} /> : null}
      </div>
    </section>
  );
}

function RuleSimulator({ matrix }: { matrix: MatrixResponse }) {
  const [actionCode, setActionCode] = useState("release");
  const [phase, setPhase] = useState<string | null>("Release");
  const [recordStatus, setRecordStatus] = useState<string | null>(null);
  const [itemKind, setItemKind] = useState<string | null>("manufactured");
  const [riskFlag, setRiskFlag] = useState<string | null>("missing_primary_ma");
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
        riskFlags: riskFlag ? [riskFlag] : [],
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
          <MatrixSelect
            value={actionCode}
            options={matrix.options.actionCodes}
            labels={labelsFor(matrix.options.actionCodes, actionCodeLabel)}
            emptyLabel="請選擇動作"
            onChange={(value) => setActionCode(value ?? "")}
          />
        </label>
        <label style={labelStyle}>
          階段
          <MatrixSelect value={phase} options={matrix.options.phases} labels={labelsFor(matrix.options.phases, phaseLabel)} onChange={setPhase} />
        </label>
        <label style={labelStyle}>
          狀態
          <MatrixSelect
            value={recordStatus}
            options={matrix.options.recordStatuses}
            labels={labelsFor(matrix.options.recordStatuses, recordStatusLabel)}
            onChange={setRecordStatus}
          />
        </label>
        <label style={labelStyle}>
          料件
          <MatrixSelect value={itemKind} options={matrix.options.itemKinds} labels={labelsFor(matrix.options.itemKinds, itemKindLabel)} onChange={setItemKind} />
        </label>
        <label style={labelStyle}>
          風險條件
          <MatrixSelect
            value={riskFlag}
            options={matrix.options.riskFlags}
            labels={labelsFor(matrix.options.riskFlags, riskFlagLabel)}
            emptyLabel="不指定"
            onChange={setRiskFlag}
          />
        </label>
      </div>
      <div>
        <button className="secondary-button" type="button" onClick={simulate} disabled={loading}>
          <Info size={16} />
          {loading ? "模擬中..." : "模擬"}
        </button>
      </div>
      {result ? (
        <details>
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.85rem" }}>顯示系統判定明細</summary>
          <pre style={{ margin: "0.5rem 0 0", padding: "0.75rem", overflow: "auto", background: "var(--panel-2)", borderRadius: "6px", fontSize: "0.8rem" }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function WorkflowWorkspaceBanner() {
  return (
    <div
      data-testid="access-workspace-context"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "0.75rem",
        alignItems: "center",
        border: "1px solid var(--line)",
        borderRadius: "8px",
        padding: "0.75rem",
        background: "var(--panel-2)",
        flexWrap: "wrap"
      }}
    >
      <div>
        <strong>目前工作區：鉦富 Jenfu PDM</strong>
        <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
          工作區由登入與部署設定自動判斷；一般管理員不需要也不能在這裡切換公司。
        </p>
      </div>
      <StatusBadge status="active" context="settingsLifecycle" />
    </div>
  );
}

function WorkflowTabBar({ activeTab, onChange }: { activeTab: WorkflowTab; onChange: (tab: WorkflowTab) => void }) {
  const tabs: Array<{ id: WorkflowTab; label: string }> = [
    { id: "roles", label: "角色管理" },
    { id: "user_access", label: "使用者權限" },
    { id: "external_specialists", label: "外部專員" },
    { id: "audit", label: "異動紀錄" }
  ];
  return (
    <div role="tablist" aria-label="使用者與權限治理" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "primary-button" : "secondary-button"}
          type="button"
          data-testid={`access-tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function AccessGovernanceSummary({ matrix }: { matrix: MatrixResponse }) {
  const activeAssignments = matrix.roleAssignments.filter((assignment) => !assignment.revokedAt);
  const externalAssignments = activeAssignments.filter((assignment) => assignment.roleCode === "external_specialist");
  const today = new Date().toISOString().slice(0, 10);
  const reviewDue = externalAssignments.filter((assignment) => assignment.reviewDueAt && assignment.reviewDueAt <= today);
  return (
    <div className="table-wrap">
      <table style={{ minWidth: "760px" }}>
        <thead>
          <tr>
            <th>治理項目</th>
            <th>目前狀態</th>
            <th>下一步</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>工作區</td>
            <td>鉦富，自動判斷</td>
            <td>一般管理員不需選公司；未來久方再用同一套工作區規則擴充。</td>
          </tr>
          <tr>
            <td>角色</td>
            <td>{matrix.roles.length} 個角色 / {activeAssignments.length} 個有效指派</td>
            <td>先用內建角色與適用範圍，避免建立過多自訂角色。</td>
          </tr>
          <tr>
            <td>外部專員</td>
            <td>{externalAssignments.length} 個有效外部專員 / {reviewDue.length} 個需提醒複核</td>
            <td>下次複核日只提醒與留下紀錄，不會自動停權。</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ExternalSpecialistsPanel({ matrix }: { matrix: MatrixResponse }) {
  const specialists = matrix.roleAssignments.filter((assignment) => assignment.roleCode === "external_specialist");
  const today = new Date().toISOString().slice(0, 10);
  const userNameById = new Map(matrix.users.map((user) => [user.id, user.displayName]));
  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <UserCog size={18} aria-hidden="true" />
        <strong>外部專員</strong>
        <InfoMark text="外部專員是限定範圍的使用者，不掛在內部組織樹；需要內部負責人、指定範圍與 90 天複核提醒。" />
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "980px" }}>
          <thead>
            <tr>
              <th>外部專員</th>
              <th>內部負責人</th>
              <th>指定範圍</th>
              <th>下次複核</th>
              <th><StatusColumnHeader label="複核狀態" context="settingsLifecycle" /></th>
              <th>規則</th>
            </tr>
          </thead>
          <tbody>
            {specialists.length ? (
              specialists.map((assignment) => {
                const due = assignment.reviewDueAt && assignment.reviewDueAt <= today && !assignment.revokedAt;
                return (
                  <tr key={assignment.id}>
                    <td>
                      <strong>{assignment.userName}</strong>
                      <br />
                      <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{assignment.userEmail ?? assignment.userId}</span>
                    </td>
                    <td>{assignment.sponsorUserId ? userNameById.get(assignment.sponsorUserId) ?? assignment.sponsorUserId : "未設定"}</td>
                    <td>{assignment.namedScope || "未設定"}</td>
                    <td>{assignment.reviewDueAt ?? "未設定"}</td>
                    <td>
                      <StatusBadge status={assignment.revokedAt ? "revoked" : due ? "warning" : "active"} context="settingsLifecycle" />
                    </td>
                    <td>可讀取、留言與提供建議；不預設建立、編輯、審核、發行、批次下載或不受控匯出。</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6}>尚未指派外部專員。請到「使用者權限」選擇「外部專員」，填內部負責人、指定範圍與下次複核日後儲存。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccessAuditPanel({ matrix }: { matrix: MatrixResponse }) {
  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <ShieldCheck size={18} aria-hidden="true" />
        <strong>權限異動紀錄</strong>
        <InfoMark text="只列出角色、權限、適用範圍、指派、代理與優先序異動；審核規則異動仍在審核矩陣區域管理。" />
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "980px" }}>
          <thead>
            <tr>
              <th>時間</th>
              <th>操作者</th>
              <th>異動內容</th>
              <th>摘要</th>
            </tr>
          </thead>
          <tbody>
            {matrix.auditEvents.length ? (
              matrix.auditEvents.map((event) => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.createdAt)}</td>
                  <td>{event.actorName ?? event.actorId ?? "系統"}</td>
                  <td>{accessAuditActionLabel(event.action)}</td>
                  <td>{formatAuditDetail(event.detail)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>尚未有角色或權限異動紀錄。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
            <th>角色類型</th>
            <th>類型</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td>{role.title}</td>
              <td>{roleCodeLabel(role.roleCode)}</td>
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
                  <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>角色類型：{roleCodeLabel(role.roleCode)}</span>
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
          自訂角色短名（系統用）
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
  draft: AssignmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssignmentDraft>>;
  onSave: () => void;
  onRevoke: (id: string) => void;
}) {
  const selectedRole = matrix.roles.find((role) => role.id === draft.roleId) ?? null;
  const selectedUser = matrix.users.find((user) => user.id === draft.userId) ?? null;
  const isExternalSpecialist = selectedRole?.roleCode === "external_specialist";
  const granted = selectedRole ? permissionPreview(matrix, selectedRole, true) : [];
  const deniedHighRisk = selectedRole ? highRiskPermissionPreview(matrix, selectedRole) : [];
  const saveDisabledReason = assignmentSaveDisabledReason(draft, selectedRole);

  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <UserCog size={18} aria-hidden="true" />
        <strong>使用者角色指派</strong>
        <InfoMark text="系統角色仍由帳號資料決定；這裡可額外指派 PDM 內建或自訂角色，所有有效指派都會納入權限矩陣、最高權限排序與稽核標示。" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem", alignItems: "end" }}>
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
                {user.displayName} / {systemRoleLabel(user.role)}
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
            onChange={(event) => {
              const role = matrix.roles.find((item) => item.id === event.target.value);
              setDraft((current) => ({
                ...current,
                roleId: event.target.value,
                scopeTemplate: defaultScopeTemplateForRole(role),
                reviewDueAt: role?.roleCode === "external_specialist" ? current.reviewDueAt || defaultReviewDueDateFromToday() : current.reviewDueAt
              }));
            }}
          >
            {matrix.roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.title}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          適用範圍
          <select
            className="dropdown-select"
            data-testid="role-assignment-scope-template"
            value={draft.scopeTemplate}
            onChange={(event) => setDraft((current) => ({ ...current, scopeTemplate: event.target.value }))}
          >
            {draft.scopeTemplate === "workspace_all" ? <option value="workspace_all">全工作區</option> : null}
            {scopeTemplateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          指定範圍
          <input
            data-testid="role-assignment-named-scope"
            value={draft.namedScope}
            onChange={(event) => setDraft((current) => ({ ...current, namedScope: event.target.value }))}
            placeholder={isExternalSpecialist ? "例如：專案 A / 產品線 B / 客戶 C" : "需要指定範圍時填寫"}
            style={fieldStyle}
          />
        </label>
        <label style={labelStyle}>
          內部負責人
          <select
            className="dropdown-select"
            data-testid="role-assignment-sponsor"
            value={draft.sponsorUserId}
            onChange={(event) => setDraft((current) => ({ ...current, sponsorUserId: event.target.value }))}
          >
            <option value="">未指定</option>
            {matrix.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName} / {systemRoleLabel(user.role)}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          開始生效
          <input
            data-testid="role-assignment-starts-at"
            type="date"
            value={draft.startsAt}
            onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))}
            style={fieldStyle}
          />
        </label>
        <label style={labelStyle}>
          下次複核
          <input
            data-testid="role-assignment-review-due"
            type="date"
            value={draft.reviewDueAt}
            onChange={(event) => setDraft((current) => ({ ...current, reviewDueAt: event.target.value }))}
            style={fieldStyle}
          />
        </label>
        <label style={labelStyle}>
          到期停用日
          <input
            type="date"
            value={draft.hardEndsAt}
            onChange={(event) => setDraft((current) => ({ ...current, hardEndsAt: event.target.value }))}
            style={fieldStyle}
          />
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
        <button className="secondary-button" type="button" onClick={onSave} disabled={Boolean(saveDisabledReason)}>
          <Save size={16} />
          儲存指派
        </button>
      </div>
      {saveDisabledReason ? <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{saveDisabledReason}</div> : null}
      <PermissionPreview
        title={selectedUser && selectedRole ? `${selectedUser.displayName} / ${selectedRole.title}` : "權限預覽"}
        scopeTemplate={draft.scopeTemplate}
        namedScope={draft.namedScope}
        granted={granted}
        deniedHighRisk={deniedHighRisk}
      />
      <div className="table-wrap">
        <table style={{ minWidth: "1120px" }}>
          <thead>
            <tr>
              <th>使用者</th>
              <th>系統角色</th>
              <th>PDM 角色</th>
              <th>適用範圍</th>
              <th>複核 / 到期</th>
              <th>原因</th>
              <th>指派時間</th>
              <th>
                <StatusColumnHeader label="指派狀態" context="settingsLifecycle" />
              </th>
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
                  <td>{systemRoleLabel(assignment.userSystemRole)}</td>
                  <td>
                    {assignment.roleTitle}
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>角色類型：{roleCodeLabel(assignment.roleCode)}</span>
                  </td>
                  <td>
                    {scopeTemplateLabel(assignment.scopeTemplate)}
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{assignment.namedScope || "未指定"}</span>
                  </td>
                  <td>
                    {assignment.reviewDueAt ?? "未設定"}
                    {assignment.startsAt ? <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}> / 開始 {assignment.startsAt}</span> : null}
                    {assignment.hardEndsAt ? <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}> / 到期停用 {assignment.hardEndsAt}</span> : null}
                  </td>
                  <td>{assignment.reason}</td>
                  <td>{formatDateTime(assignment.assignedAt)}</td>
                  <td>
                    <StatusBadge status={roleAssignmentStatus(assignment)} context="settingsLifecycle" />
                    {assignment.revokedAt ? <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0.2rem 0 0" }}>{formatDateTime(assignment.revokedAt)}</p> : null}
                  </td>
                  <td>
                    <button className="secondary-button" type="button" disabled={Boolean(assignment.revokedAt)} onClick={() => onRevoke(assignment.id)}>
                      撤銷
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>尚未建立額外角色指派</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PermissionPreview({
  title,
  scopeTemplate,
  namedScope,
  granted,
  deniedHighRisk
}: {
  title: string;
  scopeTemplate: string;
  namedScope: string;
  granted: string[];
  deniedHighRisk: string[];
}) {
  return (
    <div
      data-testid="role-assignment-permission-preview"
      style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "0.75rem", background: "var(--panel-2)", display: "grid", gap: "0.5rem" }}
    >
      <div>
        <strong>儲存前預覽：{title}</strong>
        <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
          適用範圍：{scopeTemplateLabel(scopeTemplate)}
          {namedScope ? ` / ${namedScope}` : ""}。部門只作為歸屬與通知分派依據，不會單獨授權動作。
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
        <div>
          <strong style={{ fontSize: "0.86rem" }}>將授權</strong>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.82rem" }}>{granted.length ? granted.join("、") : "沒有明確授權項目"}</p>
        </div>
        <div>
          <strong style={{ fontSize: "0.86rem" }}>高風險未授權</strong>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.82rem" }}>
            {deniedHighRisk.length ? deniedHighRisk.join("、") : "未發現被排除的高風險動作"}
          </p>
        </div>
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
  const rolePriorityText = formatRolePriority(priorityText.split(","), matrix.roles);
  return (
    <div style={{ display: "grid", gap: "0.75rem", borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <ShieldCheck size={18} aria-hidden="true" />
        <strong>最高權限排序</strong>
        <InfoMark text="同一使用者具備多角色且權限衝突時，依此排序取最高權限；只有系統管理員可調整。" />
      </div>
      <div style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "0.75rem", background: "var(--panel-2)" }}>
        <strong>目前排序：{rolePriorityText || "未設定"}</strong>
        <details style={{ marginTop: "0.5rem" }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.85rem" }}>進階調整排序</summary>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "0.75rem", alignItems: "end", marginTop: "0.75rem" }}>
            <label style={labelStyle}>
              角色短名排序
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
        </details>
      </div>
      <div className="table-wrap">
        <table style={{ minWidth: "720px" }}>
          <thead>
            <tr>
              <th>版本</th>
              <th>
                <StatusColumnHeader label="設定狀態" context="settingsLifecycle" />
              </th>
              <th>排序</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {matrix.rolePriorityVersions.length ? (
              matrix.rolePriorityVersions.map((version) => (
                <tr key={version.id}>
                  <td>{rolePriorityVersionLabel(version.versionCode)}</td>
                  <td>
                    <StatusBadge status={version.status} context="settingsLifecycle" />
                  </td>
                  <td>{formatRolePriority(version.priority, matrix.roles)}</td>
                  <td>{formatDateTime(version.createdAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td>內建預設</td>
                <td>{formatStatusForUser("default", "settingsLifecycle")}</td>
                <td>{formatRolePriority(matrix.activeRolePriority, matrix.roles)}</td>
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
          範圍
          {draft.scopeKind === "action" ? (
            <MatrixSelect
              testId="role-scope-code"
              value={draft.scopeCode}
              options={matrix.options.actionCodes}
              labels={labelsFor(matrix.options.actionCodes, actionCodeLabel)}
              emptyLabel="請選擇動作"
              onChange={(value) => setDraft((current) => ({ ...current, scopeCode: value ?? "" }))}
            />
          ) : (
            <input
              data-testid="role-scope-code"
              value={draft.scopeCode}
              onChange={(event) => setDraft((current) => ({ ...current, scopeCode: event.target.value }))}
              placeholder={draft.scopeKind === "department" ? "例如：研發部" : "例如：產品線或專案名稱"}
              style={fieldStyle}
            />
          )}
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
              <th>範圍</th>
              <th>
                <StatusColumnHeader label="設定狀態" context="settingsLifecycle" />
              </th>
              <th>切換</th>
            </tr>
          </thead>
          <tbody>
            {matrix.roleScopes.map((scope) => (
              <tr key={scope.id}>
                <td>{matrix.roles.find((role) => role.id === scope.roleId)?.title ?? scope.roleId}</td>
                <td>{scopeKindLabel(scope.scopeKind)}</td>
                <td>{scope.scopeKind === "action" ? actionCodeLabel(scope.scopeCode) : scope.scopeCode}</td>
                <td>
                  <StatusBadge status={scope.allowed ? "active" : "disabled"} context="settingsLifecycle" />
                </td>
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
                {user.displayName} / {systemRoleLabel(user.role)}
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
                {user.displayName} / {systemRoleLabel(user.role)}
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
          <MatrixSelect
            testId="delegation-action"
            value={draft.actionCode}
            options={matrix.options.actionCodes}
            labels={labelsFor(matrix.options.actionCodes, actionCodeLabel)}
            emptyLabel="全部動作"
            onChange={(value) => setDraft((current) => ({ ...current, actionCode: value ?? "" }))}
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
              <th>
                <StatusColumnHeader label="代理狀態" context="settingsLifecycle" />
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {matrix.approvalDelegations.map((delegation) => (
              <tr key={delegation.id}>
                <td>{delegation.delegatedFromName}</td>
                <td>{delegation.delegatedToName}</td>
                <td>
                  {delegation.projectCode ?? "全部專案"} / {delegation.actionCode ? actionCodeLabel(delegation.actionCode) : "全部動作"}
                </td>
                <td>
                  {(delegation.startsAt ? formatDateTime(delegation.startsAt) : "立即")} - {delegation.endsAt ? formatDateTime(delegation.endsAt) : "未設定"}
                </td>
                <td>{delegation.reason}</td>
                <td>
                  <StatusBadge status={delegation.revokedAt ? "revoked" : "active"} context="settingsLifecycle" />
                  {delegation.revokedAt ? <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0.2rem 0 0" }}>{formatDateTime(delegation.revokedAt)}</p> : null}
                </td>
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
            <th>
              <StatusColumnHeader label="設定狀態" context="settingsLifecycle" />
            </th>
            <th>生效時間</th>
            <th>退役時間</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.id}>
              <td>
                <strong>{ruleVersionLabel(version.ruleCode)}</strong>
                <br />
                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{ruleVersionDescription(version.ruleCode, version.title)}</span>
              </td>
              <td>
                <StatusBadge status={version.status} context="settingsLifecycle" />
              </td>
              <td>{formatDateTime(version.effectiveAt)}</td>
              <td>{version.retiredAt ? formatDateTime(version.retiredAt) : "未退役"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewControls({
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
        需要審核
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
        畫面提醒
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
  emptyLabel = "不限",
  testId,
  minWidth,
  onChange
}: {
  value: string | null;
  options: string[];
  labels?: Record<string, string>;
  emptyLabel?: string;
  testId?: string;
  minWidth?: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      className="dropdown-select"
      data-testid={testId}
      value={value ?? ""}
      onChange={(event) => onChange(emptyToNull(event.target.value))}
      style={{ width: "100%", minWidth }}
    >
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}

function labelsFor(options: string[], labeler: (value: string) => string) {
  return Object.fromEntries(options.map((option) => [option, labeler(option)]));
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
    "settings.admin_matrix": "權限設定",
    "numbering.create": "建立號碼",
    "numbering.draft.update": "更新草稿",
    "numbering.draft.obsolete": "作廢草稿",
    "numbering.draft.admin_confirm": "管理員確認",
    "numbering.duplicate_check": "查重",
    "numbering.link_variant": "同圖連結",
    "numbering.dvt.submit": "送 DVT",
    "numbering.approval.request": "送審",
    "numbering.approval.batch.create": "建審核批次",
    "numbering.approval.batch.decide": "批次決議",
    "numbering.approval.batch.resubmit": "退回重送",
    "numbering.impact.analyze": "影響分析",
    "numbering.impact.apply": "套用作廢",
    "numbering.import.stage": "暫存匯入",
    "numbering.import.confirm": "確認匯入",
    "numbering.export.create": "匯出總表",
    "numbering.audit_report.generate": "產生月報",
    "numbering.task.update": "更新待辦",
    "numbering.notification.update": "更新通知",
    "numbering.attachments.manage": "管理附件",
    "pdm.comment.create": "留言",
    "pdm.advice.create": "提供建議",
    "pdm.drawing_package.model_exception.confirm": "確認純 2D 圖包例外",
    "pdm.manufacturing_baseline.release": "發布製造基準",
    "pdm.shared_model.release": "發布共用 3D",
    dvt_promotion: "DVT 階段晉升",
    dvt_missing_ma_override: "DVT 缺少主要製造圖例外",
    release: "正式發行審核",
    release_missing_ma_confirm: "發行時缺少主要製造圖確認",
    same_drawing_variant_after_release: "發行後同圖多料號",
    main_drawing_restore: "恢復主要製造圖",
    merge_part_number: "合併參考料號",
    obsolete_ma_drawing: "作廢製造圖",
    obsolete_part_number: "作廢料號",
    post_release_change: "發行後異動",
    update_name: "改品名",
    update_spec: "改規格"
  };
  return labels[code] ?? "自訂權限";
}

function actionCodeLabel(code: string) {
  return approvalActionLabel(code);
}

function phaseLabel(value: string) {
  return approvalPhaseLabel(value) ?? "不限制";
}

function recordStatusLabel(value: string) {
  return approvalRecordStatusLabel(value) ?? "不限制";
}

function itemKindLabel(value: string) {
  return approvalItemKindLabel(value) ?? "不限制";
}

function riskFlagLabel(value: string) {
  return approvalRiskFlagLabel(value) ?? "不指定";
}

function hardRuleLabel(code: string) {
  const labels: Record<string, string> = {
    DUPLICATE_CODE_HARD_BLOCK: "編號不可重複",
    PRIMARY_MA_UNIQUENESS_HARD_BLOCK: "主要製造圖只能有一張",
    RELEASED_DOCUMENT_REVISION_REQUIRED: "已發布文件必須先進版",
    MAIN_DRAWING_INVALID_REVIEW_REQUIRED: "主要製造圖失效需先審核",
    PRIMARY_MA_REQUIRED_FROM_DVT: "DVT 起必須有主要製造圖",
    OVERRIDE_AUDIT_MARKER_REQUIRED: "例外必須留下稽核標示",
    HIGH_SIMILARITY_WARNING_ONLY: "高相似編號只提醒"
  };
  return labels[code] ?? "硬性限制";
}

function hardRuleMessageLabel(code: string, fallback: string) {
  const labels: Record<string, string> = {
    DUPLICATE_CODE_HARD_BLOCK: "料號、圖號與根編號不能重複，也不能用審核例外放行。",
    PRIMARY_MA_UNIQUENESS_HARD_BLOCK: "同一個料號只能指定一張主要製造圖。",
    RELEASED_DOCUMENT_REVISION_REQUIRED: "已正式發布的受影響文件，必須先建立新版或修訂後才能放行。",
    MAIN_DRAWING_INVALID_REVIEW_REQUIRED: "主要製造圖失效的料號，必須通過恢復審核後才能再次使用。",
    PRIMARY_MA_REQUIRED_FROM_DVT: "自 DVT 或正式發行開始，自製、委外與客製件必須有主要製造圖；若缺少需走例外審核。",
    OVERRIDE_AUDIT_MARKER_REQUIRED: "所有例外放行都必須在畫面與匯出資料留下標示，方便追蹤。",
    HIGH_SIMILARITY_WARNING_ONLY: "高相似編號會提醒使用者，但不會直接阻擋編號。"
  };
  return labels[code] ?? (fallback ? "此硬性限制不能由模板或一般審核設定關閉。" : "此硬性限制不能由模板或一般審核設定關閉。");
}

function ruleTemplateDescription(templateCode: string, fallback: string) {
  const descriptions: Record<string, string> = {
    rd_efficiency: "放寬部分非關鍵阻擋，適合研發試作效率優先。",
    standard_control: "維持一般審核與阻擋規則。",
    strict_control: "提高阻擋與審核強度，適合正式發行前管制。"
  };
  return descriptions[templateCode] ?? (fallback ? "套用這組預設審核規則。" : "套用這組預設審核規則。");
}

function ruleVersionLabel(ruleVersionId: string) {
  if (ruleVersionId === "numbering-rule-v3-alpha-root") return "編號規則 v3";
  if (ruleVersionId === "numbering-rule-v2") return "編號規則 v2";
  return "目前規則版本";
}

function ruleVersionDescription(ruleVersionId: string, fallback: string) {
  if (ruleVersionId === "numbering-rule-v3-alpha-root") return "目前使用中的英數根號編號與審核規則";
  if (ruleVersionId === "numbering-rule-v2") return "目前使用中的編號與審核規則";
  return fallback ? "自訂規則版本" : "自訂規則版本";
}

function rolePriorityVersionLabel(versionCode: string) {
  if (versionCode === "default") return "內建預設";
  return "權限排序版本";
}

function formatRolePriority(priority: string[], roles: AdminRole[]) {
  const roleTitleByCode = new Map(roles.map((role) => [role.roleCode, role.title]));
  return priority
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => roleTitleByCode.get(code) ?? roleCodeLabel(code))
    .join(" > ");
}

function systemRoleLabel(role: string) {
  const labels: Record<string, string> = {
    Engineer: "工程師",
    "R&D Manager": "研發主管",
    Admin: "管理員",
    Manufacturing: "製造",
    Procurement: "採購",
    "QA/QC": "品保"
  };
  return labels[role] ?? role;
}

function roleCodeLabel(code: string) {
  const labels: Record<string, string> = {
    system_admin: "系統管理員",
    pdm_admin: "PDM 管理員",
    document_admin: "文件管理員",
    qa: "品保",
    rd: "研發工程師",
    rd_manager: "研發主管",
    manufacturing: "製造",
    procurement: "採購",
    external_specialist: "外部專員"
  };
  return labels[code] ?? "自訂角色";
}

function defaultScopeTemplateForRole(role: AdminRole | null | undefined) {
  if (!role) return "own_department";
  if (role.roleCode === "qa") return "workspace_quality";
  if (role.roleCode === "manufacturing" || role.roleCode === "procurement") return "released_only";
  if (role.roleCode === "external_specialist") return "named_scope";
  if (role.roleCode === "system_admin" || role.roleCode === "pdm_admin") return "workspace_all";
  return "own_department";
}

function scopeTemplateLabel(value: string) {
  if (value === "workspace_all") return "全工作區";
  return scopeTemplateOptions.find((option) => option.value === value)?.label ?? value;
}

function permissionPreview(matrix: MatrixResponse, role: AdminRole, allowed: boolean) {
  return matrix.rolePermissions
    .filter((permission) => permission.roleId === role.id && permission.allowed === allowed)
    .map((permission) => permissionLabel(permission.permissionCode))
    .slice(0, 10);
}

function highRiskPermissionPreview(matrix: MatrixResponse, role: AdminRole) {
  const highRisk = [
    "numbering.create",
    "numbering.draft.update",
    "numbering.approval.batch.decide",
    "numbering.export.create",
    "numbering.import.confirm",
    "settings.admin_matrix",
    "release",
    "post_release_change",
    "obsolete_part_number",
    "obsolete_ma_drawing"
  ];
  return highRisk.filter((code) => !rolePermissionEnabled(matrix, role.id, code === "settings.admin_matrix" ? "action" : "action", code)).map(permissionLabel);
}

function assignmentSaveDisabledReason(draft: AssignmentDraft, role: AdminRole | null) {
  if (!draft.userId) return "請先選擇使用者。";
  if (!role) return "請先選擇角色。";
  if (!draft.reason.trim()) return "請填寫指派原因，方便後續追蹤。";
  if (draft.scopeTemplate === "named_scope" && !draft.namedScope.trim()) return "指定範圍需要填寫實際可看的專案、產品線或客戶。";
  if (role.roleCode === "external_specialist") {
    if (draft.scopeTemplate !== "named_scope") return "外部專員必須使用指定範圍。";
    if (!draft.sponsorUserId) return "外部專員必須指定內部負責人。";
    if (!draft.reviewDueAt) return "外部專員必須有第一次複核日期。";
  }
  return "";
}

function roleAssignmentStatus(assignment: RoleAssignment) {
  if (assignment.revokedAt) return "revoked";
  const today = new Date().toISOString().slice(0, 10);
  if (assignment.startsAt && assignment.startsAt > today) return "scheduled";
  if (assignment.hardEndsAt && assignment.hardEndsAt <= today) return "expired";
  return "active";
}

function accessAuditActionLabel(action: string) {
  const labels: Record<string, string> = {
    "numbering.role.upsert": "角色異動",
    "numbering.role_permission.upsert": "角色權限異動",
    "numbering.role_scope.upsert": "角色範圍異動",
    "numbering.user_role_assignment.upsert": "使用者角色指派",
    "numbering.user_role_assignment.revoke": "使用者角色撤銷",
    "numbering.role_priority.save": "角色優先序",
    "numbering.approval_delegation.upsert": "代理設定",
    "numbering.approval_delegation.revoke": "代理撤銷"
  };
  return labels[action] ?? "系統異動";
}

function formatAuditDetail(detail: Record<string, unknown>) {
  const roleCode = typeof detail.roleCode === "string" ? roleCodeLabel(detail.roleCode) : "";
  const reason = typeof detail.reason === "string" ? detail.reason : "";
  const markers = Array.isArray(detail.markers) ? detail.markers.map((marker) => auditMarkerLabel(String(marker))).join("、") : "";
  const summary = [roleCode, reason, markers].filter(Boolean).join(" / ");
  if (summary) return summary;
  return "系統已留下完整異動紀錄";
}

function auditMarkerLabel(value: string) {
  const labels: Record<string, string> = {
    role_assignment_override: "人工角色指派"
  };
  return labels[value] ?? "系統標示";
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
