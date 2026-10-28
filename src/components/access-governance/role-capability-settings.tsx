'use client'

import { pdmPermissionFetch as fetch, invalidatePdmPermissions } from "@/lib/pdm-permission-client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ArrowLeft, History, LoaderCircle, Plus, RefreshCw, Save } from 'lucide-react'

type ActiveTuple = { catalogVersion: string; catalogSha256: string }
type Permission = { kind: 'page' | 'action'; code: string; allowed: boolean }
type Role = { stableRoleId: string; roleCode: string; displayName: string; roleStatus: 'active' | 'inactive'; permissions: Permission[] }
type Profile = { stableRoleId: string; permissionRoleId: string; presentationName: string; presentationOrder: number;
  assignmentDisposition: 'selectable' | 'legacy-only' | 'hidden-protected' }
type Action = { groupId: string; groupLabel: string; groupOrder: number; actionId: string; actionLabel: string; actionOrder: number; code: string }
type Draft = { draftId: string; revision: number; status: 'OPEN' | 'APPLIED'; appliedCatalogVersion: string | null }
type Workspace = { actorPrincipalId: string; publicationFormat: string; active: ActiveTuple; groups: Action[];
  roles: Role[]; roleProfiles: Profile[]; selectedDraft: Draft | null; admission: { read: boolean; edit: boolean; apply: boolean } }
type RoleChange = { type: 'create'; clientRoleId: string; displayName: string } | { type: 'deactivate' | 'reactivate'; stableRoleId: string }
type CapabilityChange = { roleRef: { stableRoleId: string } | { clientRoleId: string }; groupId: string; actionId: string; enabled: boolean }
type DraftSummary = { draftId: string; revision: number; status: 'OPEN' | 'APPLIED'; updatedAt: string }
type PublicationSummary = { catalogVersion: string; catalogSha256: string; lifecycle: string; publishedAt: string; publicationFormat: string }
type Page<T> = { items: T[]; nextCursor: string | null }
type PublicationAudit = { actorPrincipalId: string; reason: string; diff: unknown; before: unknown; after: unknown; requestId: string }
type PublicationDetail = PublicationSummary & { roles: Role[]; audit: PublicationAudit | null }
type Preview = { confirmation: { draftId: string; draftRevision: number; expectedActive: ActiveTuple };
  diff: { roleChanges: Array<Record<string, unknown>>; capabilityChanges: Array<Record<string, unknown>>; policyTransition: string } }
type Pending = { requestId?: string; operation: 'create' | 'save' | 'apply'; draftId: string; actorPrincipalId: string; body?: string; url?: string }
const pendingKey = 'pdm-role-policy-pending'
class PolicyError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}
function errorText(code?: string) {
  if (code?.includes('CONFLICT')) return '版本或登入身分已變更，請重新讀取；未保存修改仍保留。'
  if (code?.includes('MANAGER') || code?.includes('denied')) return '目前帳號沒有這項管理權限。'
  if (code?.includes('DISPLAY_NAME')) return '角色名稱已存在或格式不正確。'
  if (code === 'NO_CHANGE') return '與目前生效版本相同，無需套用。'
  return '操作未完成，請檢查內容或稍後重試。'
}
async function requestData<T>(url: string, init?: RequestInit, actor?: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init, headers: {
    ...(init?.body ? { 'content-type': 'application/json' } : {}),
    ...(actor ? { 'x-pdm-policy-principal': actor } : {}), ...(init?.headers ?? {}) } })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.contractVersion !== 'ai-pdm.role-policy-workspace.v3' || !body.data) {
    throw new PolicyError(errorText(body?.code), response.ok ? 503 : response.status, body?.code)
  }
  return body.data as T
}
function enabled(role: Role, action: Action) {
  return role.permissions.some(p => p.kind === 'action' && p.code === action.code && p.allowed)
}
function readableAuditDiff(detail: PublicationDetail, groups: Action[]) {
  const diff = detail.audit?.diff && typeof detail.audit.diff === 'object'
    ? detail.audit.diff as { roleChanges?: unknown[]; capabilityChanges?: unknown[]; policyTransition?: unknown } : {}
  const roleNames = new Map(detail.roles.map(role => [role.stableRoleId, role.displayName]))
  const lines: string[] = []
  for (const value of Array.isArray(diff.roleChanges) ? diff.roleChanges : []) {
    if (!value || typeof value !== 'object') continue
    const change = value as Record<string, unknown>
    const name = roleNames.get(String(change.stableRoleId)) ?? String(change.displayName ?? change.stableRoleId ?? '角色')
    const action = change.type === 'create' ? '新增' : change.type === 'deactivate' ? '停用' : '恢復'
    lines.push(`${action}角色：${name}`)
  }
  for (const value of Array.isArray(diff.capabilityChanges) ? diff.capabilityChanges : []) {
    if (!value || typeof value !== 'object') continue
    const change = value as Record<string, unknown>
    const role = roleNames.get(String(change.stableRoleId)) ?? String(change.stableRoleId ?? '角色')
    const action = groups.find(candidate => candidate.groupId === change.groupId && candidate.actionId === change.actionId)
    const before = change.before === true ? '允許' : '未授予'
    const after = change.after === true ? '允許' : '未授予'
    lines.push(`${role}／${action?.groupLabel ?? String(change.groupId ?? '作業')}／${action?.actionLabel ?? String(change.actionId ?? '動作')}：${before} → ${after}`)
  }
  if (diff.policyTransition === 'legacy-to-dynamic') lines.unshift('首次套用：由既有權限切換至七角色分組權限')
  return lines.length ? lines : ['權限內容已異動']
}
function appendUnique<T>(current: T[], incoming: T[], id: (item: T) => string) {
  const seen = new Set(current.map(id))
  return [...current, ...incoming.filter(item => {
    const key = id(item)
    if (seen.has(key)) return false
    seen.add(key); return true
  })]
}
export function RoleCapabilitySettings() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [draftCursor, setDraftCursor] = useState<string | null>(null)
  const [loadingMoreDrafts, setLoadingMoreDrafts] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [roleChanges, setRoleChanges] = useState<RoleChange[]>([])
  const [changes, setChanges] = useState<CapabilityChange[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reason, setReason] = useState('')
  const [history, setHistory] = useState<PublicationSummary[] | null>(null)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false)
  const [historyDetail, setHistoryDetail] = useState<PublicationDetail | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null)
  const [leave, setLeave] = useState<(() => Promise<void>) | null>(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const addRoleDialog = useRef<HTMLDialogElement>(null)
  const addRoleInput = useRef<HTMLInputElement>(null)
  const leaveDialog = useRef<HTMLDialogElement>(null)
  const leaveRestoreFocus = useRef<HTMLElement | null>(null)
  const allowUnload = useRef(false)
  const draftGeneration = useRef(0)
  const historyGeneration = useRef(0)
  const procurementPair = useMemo(() => {
    const canonical = roles.find(role => role.stableRoleId === 'role-procurement')
    const legacyAlias = roles.find(role => role.stableRoleId === 'role-production-planning')
    return canonical && legacyAlias ? { canonical, legacyAlias } : null
  }, [roles])
  const dirty = roleChanges.length > 0 || changes.length > 0
  const locked = busy || pending !== null
  const editable = workspace?.admission.edit === true && workspace.selectedDraft?.status === 'OPEN'
  const legacy = !workspace?.selectedDraft && workspace?.publicationFormat === 'legacy-static-v1'
  const selectable = useMemo(() => profiles.filter(p => p.assignmentDisposition === 'selectable')
    .sort((a, b) => a.presentationOrder - b.presentationOrder), [profiles])
  const groups = useMemo(() => [...new Map((workspace?.groups ?? []).map(a =>
    [a.groupId, { id: a.groupId, label: a.groupLabel, order: a.groupOrder }])).values()].sort((a, b) => a.order - b.order), [workspace])
  const selectedProfile = selectable.find(p => p.stableRoleId === selected)
  const selectedRole = roles.find(r => r.stableRoleId === selectedProfile?.permissionRoleId)
  const load = useCallback(async (draftId?: string | null) => {
    const current = ++sequence.current
    const listGeneration = ++draftGeneration.current
    ++historyGeneration.current
    setDrafts([]); setDraftCursor(null)
    setHistory(null); setHistoryCursor(null); setHistoryDetail(null)
    setLoading(true); setError(null)
    try {
      const data = await requestData<Workspace>('/api/settings/access/role-policies/workspace' +
        (draftId ? '?draftId=' + encodeURIComponent(draftId) : ''))
      const saved = await requestData<Page<DraftSummary>>('/api/settings/access/role-policies/drafts', undefined, data.actorPrincipalId)
      if (current !== sequence.current || listGeneration !== draftGeneration.current) return
      setWorkspace(data); setRoles(data.roles); setProfiles(data.roleProfiles); setDrafts(saved.items); setDraftCursor(saved.nextCursor)
      setPending(old => old?.actorPrincipalId === data.actorPrincipalId ? old : null)
      setRoleChanges([]); setChanges([]); setPreview(null)
      const url = new URL(window.location.href)
      if (data.selectedDraft) url.searchParams.set('rolePolicyDraft', data.selectedDraft.draftId)
      else url.searchParams.delete('rolePolicyDraft')
      window.history.replaceState(window.history.state, '', url)
      try {
        const hint: Pending | null = JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null')
        if (hint?.actorPrincipalId === data.actorPrincipalId && ['create', 'save', 'apply'].includes(hint.operation)) {
          setPending(old => old?.actorPrincipalId === data.actorPrincipalId ? old : hint)
        } else { sessionStorage.removeItem(pendingKey); setPending(null) }
      } catch { /* Optional recovery hints never block normal operation. */ }
    } catch (failure) {
      if (current === sequence.current) {
        if (failure instanceof PolicyError && (failure.status === 401 || failure.status === 403)) {
          setWorkspace(null); setRoles([]); setProfiles([]); setPending(null); setRoleChanges([]); setChanges([])
        }
        setError(failure instanceof Error ? failure.message : '目前無法讀取角色權限。')
      }
      throw failure
    } finally { if (current === sequence.current) setLoading(false) }
  }, [])
  useEffect(() => {
    void load(new URL(window.location.href).searchParams.get('rolePolicyDraft')).catch(() => undefined)
    return () => { sequence.current += 1 }
  }, [load])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      if (allowUnload.current) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function remember(value: Pending | null) {
    setPending(value)
    if (value) setRecoveryMessage(null)
    try {
      if (!value) sessionStorage.removeItem(pendingKey)
      else { const { body: _body, url: _url, ...hint } = value; sessionStorage.setItem(pendingKey, JSON.stringify(hint)) }
    } catch { /* Storage is not required for writes or recovery. */ }
  }
  async function mutation<T>(url: string, payload: Record<string, unknown>, operation: Pending['operation'], draftId: string) {
    const actor = workspace!.actorPrincipalId
    const requestId = operation === 'apply' ? crypto.randomUUID() : undefined
    const body = JSON.stringify({ ...payload, ...(requestId ? { requestId } : {}) })
    const attempt = { requestId, operation, draftId, actorPrincipalId: actor, url, body }
    remember(attempt)
    try {
      const result = await requestData<T>(url, { method: 'POST', body }, actor)
      remember(null); return result
    } catch (failure) {
      if (failure instanceof PolicyError && failure.status >= 400 && failure.status < 500) remember(null)
      throw failure
    }
  }
  function requestLeave(action: () => Promise<void>) {
    if (locked) return
    if (!dirty) { void action(); return }
    const active = document.activeElement
    leaveRestoreFocus.current = active instanceof HTMLElement ? active : null
    setLeave(() => action)
  }
  async function navigate(action: () => Promise<void>) {
    requestLeave(action)
  }
  useEffect(() => {
    const onAnchorClick = (event: MouseEvent) => {
      if (!dirty || locked || leave || allowUnload.current || event.defaultPrevented ||
          event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.href === window.location.href) return
      event.preventDefault(); event.stopPropagation()
      requestLeave(() => {
        allowUnload.current = true
        anchor.click()
        return Promise.resolve()
      })
    }
    document.addEventListener('click', onAnchorClick, true)
    return () => document.removeEventListener('click', onAnchorClick, true)
  }, [dirty, leave, locked])
  function discardLocalChanges() {
    setRoleChanges([]); setChanges([]); setPreview(null); setReason('')
  }
  function closeLeaveDialog() {
    if (leaveDialog.current?.open) {
      if (typeof leaveDialog.current.close === 'function') leaveDialog.current.close()
      else leaveDialog.current.removeAttribute('open')
    }
    const restore = leaveRestoreFocus.current
    leaveRestoreFocus.current = null
    setLeave(null)
    if (restore) window.setTimeout(() => restore.focus(), 0)
  }
  function handleLeaveKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.preventDefault(); closeLeaveDialog(); return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    if (focusable.length === 0) { event.preventDefault(); return }
    const first = focusable[0]; const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  useEffect(() => {
    const dialog = leaveDialog.current
    if (!dialog) return
    if (!leave) {
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close()
        else dialog.removeAttribute('open')
      }
      return
    }
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    window.setTimeout(() => dialog.querySelector<HTMLElement>('[data-leave-first]')?.focus(), 0)
  }, [leave])
  async function createDraft(sourceHistoryVersion?: string) {
    if (!workspace || locked) return
    setBusy(true); setError(null)
    try {
      const draftId = crypto.randomUUID()
      await mutation('/api/settings/access/role-policies/drafts',
        { draftId, expectedActive: workspace.active, ...(sourceHistoryVersion ? { sourceHistoryVersion } : {}) }, 'create', draftId)
      setHistory(null); setHistoryDetail(null); await load(draftId)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '無法建立草稿。') }
    finally { setBusy(false) }
  }
  function toggle(role: Role, action: Action, allow: boolean) {
    if (!editable || locked) return
    const change: CapabilityChange = { roleRef: { stableRoleId: role.stableRoleId }, groupId: action.groupId, actionId: action.actionId, enabled: allow }
    setChanges(old => [...old.filter(c => !('stableRoleId' in c.roleRef && c.roleRef.stableRoleId === role.stableRoleId &&
      c.groupId === action.groupId && c.actionId === action.actionId)), change])
    setRoles(old => old.map(r => r.stableRoleId !== role.stableRoleId ? r : { ...r,
      permissions: [...r.permissions.filter(p => !(p.kind === 'action' && p.code === action.code)),
        ...(allow ? [{ kind: 'action' as const, code: action.code, allowed: true }] : [])] }))
    setPreview(null)
  }
  function status(role: Role) {
    const next = role.roleStatus === 'active' ? 'inactive' : 'active'
    const policyRoleId = role.stableRoleId === 'role-production-planning' ? 'role-procurement' : role.stableRoleId
    const paired = policyRoleId === 'role-procurement'
    const confirmation = paired
      ? '套用後會同步停止「採購」與「生管人員」兩種舊指派的角色授權；兩種指派與歷史都會保留，恢復後仍有效的指派可再次生效。'
      : '套用後停止此角色授權。指派與歷史會保留，恢復後仍有效的指派可再次生效。'
    if (next === 'inactive' && !window.confirm(confirmation)) return
    const pairedIds = paired ? ['role-procurement', 'role-production-planning'] : [role.stableRoleId]
    setRoleChanges(old => [...old.filter(c => c.type === 'create' || !pairedIds.includes('stableRoleId' in c ? c.stableRoleId : '')),
      { type: next === 'active' ? 'reactivate' : 'deactivate', stableRoleId: policyRoleId }])
    setRoles(old => old.map(r => pairedIds.includes(r.stableRoleId) ? { ...r, roleStatus: next } : r))
    setPreview(null)
  }
  function addRole() {
    setNewRoleName('')
    addRoleDialog.current?.showModal()
    window.setTimeout(() => addRoleInput.current?.focus(), 0)
  }
  function confirmAddRole() {
    const displayName = newRoleName.normalize('NFC').trim()
    if (!displayName) return
    const clientRoleId = 'client-' + crypto.randomUUID()
    setRoleChanges(old => [...old, { type: 'create', clientRoleId, displayName }])
    setRoles(old => [...old, { stableRoleId: clientRoleId, roleCode: clientRoleId, displayName, roleStatus: 'active', permissions: [] }])
    setProfiles(old => [...old, { stableRoleId: clientRoleId, permissionRoleId: clientRoleId,
      presentationName: displayName, presentationOrder: Math.max(...old.filter(p => p.assignmentDisposition === 'selectable').map(p => p.presentationOrder)) + 1, assignmentDisposition: 'selectable' }])
    setPreview(null)
    addRoleDialog.current?.close()
    setNewRoleName('')
  }
  async function saveDraft() {
    const draft = workspace!.selectedDraft!
    const saved = await mutation<Draft>('/api/settings/access/role-policies/drafts/' + draft.draftId + '/save',
      { expectedRevision: draft.revision, roleChanges, changes: changes.map(c => {
        const id = 'stableRoleId' in c.roleRef ? c.roleRef.stableRoleId : null
        return id?.startsWith('client-') ? { ...c, roleRef: { clientRoleId: id } } : c
      }) }, 'save', draft.draftId)
    await load(draft.draftId)
    return saved
  }
  async function save(confirm = false) {
    if (!workspace?.selectedDraft || locked || !editable) return
    setBusy(true); setError(null)
    try {
      const saved = dirty ? await saveDraft() : workspace.selectedDraft
      if (confirm) setPreview(await requestData<Preview>('/api/settings/access/role-policies/drafts/' +
        saved.draftId + '/preview?expectedRevision=' + saved.revision, undefined, workspace.actorPrincipalId))
      return true
    } catch (failure) { setError(failure instanceof Error ? failure.message : '草稿保存失敗。'); return false }
    finally { setBusy(false) }
  }
  async function apply() {
    if (!preview || locked) return
    setBusy(true); setError(null)
    try {
      await mutation('/api/settings/access/role-policies/applications', { confirmation: preview.confirmation, reason }, 'apply', preview.confirmation.draftId)
      invalidatePdmPermissions("permissions-changed")
      setReason(''); await load(); confirmButton.current?.focus()
    } catch (failure) { setError(failure instanceof Error ? failure.message : '套用結果待確認。') }
    finally { setBusy(false) }
  }
  async function recoverDraft() {
    const attempt = pending
    if (!attempt || busy) return
    if (!workspace || workspace.actorPrincipalId !== attempt.actorPrincipalId) {
      remember(null); setRecoveryMessage('登入身分已變更，已清理舊的操作提示。'); return
    }
    setBusy(true); setError(null)
    try {
      const draft = await requestData<Draft>('/api/settings/access/role-policies/drafts/' + attempt.draftId, undefined, attempt.actorPrincipalId)
      await load(attempt.draftId)
      if (attempt.operation !== 'apply') remember(null)
      setRecoveryMessage(attempt.operation === 'apply'
        ? `已讀回伺服器草稿（revision ${draft.revision}）；套用命令仍待觀察，未自動重送。`
        : `已讀回伺服器草稿（revision ${draft.revision}），目前結果已更新。`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '伺服器草稿仍待確認。') }
    finally { setBusy(false) }
  }
  async function recoverCommand() {
    const attempt = pending
    if (!attempt || busy) return
    if (!workspace || workspace.actorPrincipalId !== attempt.actorPrincipalId) {
      remember(null); setRecoveryMessage('登入身分已變更，已清理舊的操作提示。'); return
    }
    if (!attempt.requestId) { setRecoveryMessage('缺少套用 request id，保留提示並改用伺服器草稿確認。'); return }
    setBusy(true); setError(null)
    try {
      await requestData('/api/settings/access/role-policies/commands/' + attempt.requestId, undefined, attempt.actorPrincipalId)
      invalidatePdmPermissions("permissions-changed")
      remember(null); await load()
      setRecoveryMessage('已讀回伺服器套用結果，目前生效版本已重新載入。')
    } catch (failure) {
      if (failure instanceof PolicyError && failure.status === 404) {
        setRecoveryMessage('伺服器尚未觀察到此套用命令；未宣告回滾，也未自動重送。請重新確認伺服器草稿。')
      } else setError(failure instanceof Error ? failure.message : '套用結果仍待確認。')
    }
    finally { setBusy(false) }
  }
  async function recover() {
    if (pending?.operation === 'apply') await recoverCommand()
    else await recoverDraft()
  }
  async function openHistoryDetail(catalogVersion: string) {
    setBusy(true); setError(null)
    try {
      setHistoryDetail(await requestData<PublicationDetail>('/api/settings/access/role-policies/publications/' + encodeURIComponent(catalogVersion), undefined, workspace!.actorPrincipalId))
    } catch (failure) { setError(failure instanceof Error ? failure.message : '無法讀取版本詳情。') }
    finally { setBusy(false) }
  }
  async function openHistory() {
    const generation = ++historyGeneration.current
    setBusy(true); setError(null); setHistoryDetail(null)
    setHistoryCursor(null)
    try {
      const page = await requestData<Page<PublicationSummary>>('/api/settings/access/role-policies/publications', undefined, workspace!.actorPrincipalId)
      if (generation !== historyGeneration.current) return
      setHistory(page.items); setHistoryCursor(page.nextCursor)
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : '無法讀取異動紀錄。') }
    finally { setBusy(false) }
  }
  async function loadOlderDrafts() {
    const cursor = draftCursor
    const generation = draftGeneration.current
    if (!cursor || busy || loadingMoreDrafts || !workspace) return
    setLoadingMoreDrafts(true); setError(null)
    try {
      const page = await requestData<Page<DraftSummary>>('/api/settings/access/role-policies/drafts?cursor=' + encodeURIComponent(cursor), undefined, workspace.actorPrincipalId)
      if (generation !== draftGeneration.current) return
      setDrafts(old => appendUnique(old, page.items, item => item.draftId)); setDraftCursor(page.nextCursor)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '無法讀取較舊草稿。') }
    finally { setLoadingMoreDrafts(false) }
  }
  async function loadMoreHistory() {
    const cursor = historyCursor
    const generation = historyGeneration.current
    if (!cursor || busy || loadingMoreHistory || !workspace || !history) return
    setLoadingMoreHistory(true); setError(null)
    try {
      const page = await requestData<Page<PublicationSummary>>('/api/settings/access/role-policies/publications?cursor=' + encodeURIComponent(cursor), undefined, workspace.actorPrincipalId)
      if (generation !== historyGeneration.current) return
      setHistory(old => old ? appendUnique(old, page.items, item => item.catalogVersion) : old); setHistoryCursor(page.nextCursor)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '無法讀取更多異動紀錄。') }
    finally { setLoadingMoreHistory(false) }
  }
  function controls(profile: Profile, groupId: string) {
    const role = roles.find(r => r.stableRoleId === profile.permissionRoleId)!
    return workspace!.groups.filter(a => a.groupId === groupId).sort((a, b) => a.actionOrder - b.actionOrder).map(action =>
      <label key={action.code} className="role-policy-action"><input type="checkbox" checked={enabled(role, action)}
        disabled={!editable || locked || role.roleStatus !== 'active' || (role.roleCode === 'external_specialist' && action.actionId !== 'view')}
        aria-label={profile.presentationName + ' ' + action.groupLabel + ' ' + action.actionLabel}
        onChange={e => toggle(role, action, e.target.checked)} />{action.actionLabel}</label>)
  }
  if (loading && !workspace) return <section className="access-governance-state"><LoaderCircle size={20} className="access-governance-spin" />載入中</section>
  if (!workspace) return <section role="alert" className="access-governance-state is-error">{error}
    <button type="button" className="secondary-button" onClick={() => void load().catch(() => undefined)}>重試</button></section>
  return <section className="access-governance role-policy-settings" data-testid="role-policy-settings" aria-busy={busy || loading}>
    <header className="access-role-header"><h2>角色與能力</h2><button type="button" className="secondary-button" disabled={busy}
      onClick={() => void openHistory()}><History size={16} />異動紀錄</button></header>
    <div className="access-actions role-policy-toolbar">
      <select aria-label="選擇草稿" disabled={locked} value={workspace.selectedDraft?.draftId ?? ''}
        onChange={e => { const id = e.target.value; void navigate(() => load(id || null)) }}>
        <option value="">目前生效版本</option>{drafts.map(d => <option key={d.draftId} value={d.draftId}>
          {new Date(d.updatedAt).toLocaleString()} · {d.status === 'OPEN' ? '草稿' : '已套用'} · {d.revision}</option>)}</select>
      {draftCursor ? <button type="button" className="secondary-button" disabled={busy || loadingMoreDrafts}
        onClick={() => void loadOlderDrafts()}>{loadingMoreDrafts ? '讀取中…' : '讀取較舊草稿'}</button> : null}
      <button type="button" className="secondary-button" disabled={locked || !workspace.admission.edit}
        onClick={() => void navigate(() => createDraft())}>建立草稿</button>
      <button type="button" className="primary-button" disabled={locked || !editable} onClick={addRole}><Plus size={16} />新增角色</button>
      <button type="button" className="secondary-button" aria-label="重新整理" disabled={locked}
        onClick={() => void navigate(() => load(workspace.selectedDraft?.draftId))}><RefreshCw size={16} /></button>
    </div>
    {error ? <p role="alert" className="access-feedback is-error">{error}</p> : null}
    {pending ? <div role="status" className="access-feedback">{recoveryMessage ?? '操作結果待確認。'}
      <div className="access-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void recover()}>
          {pending.operation === 'apply' ? '查詢套用結果' : '讀取伺服器草稿'}</button>
        {pending.operation === 'apply' ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void recoverDraft()}>
          重新確認伺服器草稿</button> : null}
      </div></div> : recoveryMessage ? <p role="status" className="access-feedback">{recoveryMessage}</p> : null}
    {history ? <div className="access-capability-table"><button type="button" className="secondary-button" onClick={() => { setHistory(null); setHistoryDetail(null) }}><ArrowLeft size={16} />返回矩陣</button>
      <table aria-label="權限異動紀錄"><thead><tr><th>時間</th><th>狀態</th><th>操作</th></tr></thead><tbody>{history.map(h => <tr key={String(h.catalogVersion)}>
        <td>{new Date(String(h.publishedAt)).toLocaleString()}</td><td>{h.lifecycle === 'active' ? '目前生效' : '歷史版本'}</td>
        <td><div className="role-policy-history-actions"><button type="button" className="secondary-button" disabled={busy}
          onClick={() => void openHistoryDetail(String(h.catalogVersion))}>查看詳情</button>
          {workspace.admission.edit && h.publicationFormat === 'dynamic-policy-v1' ? <button type="button" className="secondary-button" disabled={locked}
            onClick={() => void navigate(() => createDraft(String(h.catalogVersion)))}>以此建立草稿</button> : <span>既有版本</span>}</div></td></tr>)}</tbody></table>
      {historyCursor ? <button type="button" className="secondary-button role-policy-more" disabled={busy || loadingMoreHistory}
        onClick={() => void loadMoreHistory()}>{loadingMoreHistory ? '讀取中…' : '更多異動紀錄'}</button> : null}
      {historyDetail ? <section className="role-policy-history-detail" aria-label="版本詳情">
        <header className="access-role-header"><h3>版本詳情：{historyDetail.catalogVersion}</h3><button type="button" className="secondary-button" onClick={() => setHistoryDetail(null)}>關閉</button></header>
        <dl><div><dt>發布時間</dt><dd>{new Date(historyDetail.publishedAt).toLocaleString()}</dd></div><div><dt>狀態</dt><dd>{historyDetail.lifecycle === 'active' ? '目前生效' : '歷史版本'}</dd></div></dl>
        {historyDetail.audit ? <><p>異動人員：{historyDetail.audit.actorPrincipalId}</p><p>異動原因：{historyDetail.audit.reason || '未填寫'}</p><h4>可讀差異</h4><ul>{readableAuditDiff(historyDetail, workspace.groups).map((line, index) => <li key={index}>{line}</li>)}</ul></>
          : <p>此版本沒有可提供的異動紀錄。</p>}
      </section> : null}</div>
      : <>
        {selectedProfile && selectedRole ? <div className="access-role-header"><button type="button" className="secondary-button" onClick={() => setSelected(null)}><ArrowLeft size={16} />返回矩陣</button>
          <h3>{selectedProfile.presentationName}{selectedRole.roleStatus === 'inactive' ? '（已停用）' : ''}</h3>
          {selectedRole.stableRoleId.startsWith('client-') ? <small className="role-policy-draft-role-status">新增角色尚未保存；可取消未保存修改放棄此草稿。</small> : null}
          {procurementPair && selectedRole.stableRoleId === procurementPair.canonical.stableRoleId ? <small className="role-policy-alias-status">
            舊指派同步：採購 {procurementPair.canonical.roleStatus === 'active' ? '啟用' : '停用'}／生管人員 {procurementPair.legacyAlias.roleStatus === 'active' ? '啟用' : '停用'}</small> : null}
          {editable && !selectedRole.stableRoleId.startsWith('client-') ? <button type="button" className="secondary-button" disabled={locked}
            onClick={() => status(selectedRole)}>{selectedRole.roleStatus === 'active' ? '停用角色' : '恢復角色'}</button> : null}</div> : null}
        <div className={'access-capability-table role-policy-matrix' + (selectedProfile ? ' role-policy-single-role' : '')}><table aria-label={selectedProfile ? selectedProfile.presentationName + '角色工作台' : '角色能力矩陣'}>
          <thead><tr><th scope="col">作業</th>{(selectedProfile ? [selectedProfile] : selectable).map(p =>
            <th scope="col" key={p.stableRoleId}><button type="button" className="role-policy-role-name" onClick={() => setSelected(p.stableRoleId)}>{p.presentationName}</button>
              {roles.find(r => r.stableRoleId === p.permissionRoleId)?.roleStatus === 'inactive' ? <small>已停用</small> : null}
              {procurementPair && p.permissionRoleId === procurementPair.canonical.stableRoleId ? <small className="role-policy-alias-status">舊指派同步：採購 {procurementPair.canonical.roleStatus === 'active' ? '啟用' : '停用'}／生管人員 {procurementPair.legacyAlias.roleStatus === 'active' ? '啟用' : '停用'}</small> : null}</th>)}</tr></thead>
          <tbody>{groups.map(g => <tr key={g.id}><th scope="row">{g.label}</th>{(selectedProfile ? [selectedProfile] : selectable).map(p =>
            <td key={p.stableRoleId}>{legacy ? <span>既有細項</span> : controls(p, g.id)}</td>)}</tr>)}
            <tr><th scope="row">PDM 管理</th>{(selectedProfile ? [selectedProfile] : selectable).map(p =>
              <td key={p.stableRoleId}>{p.stableRoleId === 'role-pdm-admin' ? <><label className="role-policy-action"><input type="checkbox" checked disabled />查看</label>
                <label className="role-policy-action" title="管理須由 OrgMaster 指派系統管理資格"><input type="checkbox" checked={false} disabled />管理</label></> : '—'}</td>)}</tr></tbody>
        </table></div>
        {legacy ? <details><summary>查看既有權限細項</summary>{roles.map(r => <details key={r.stableRoleId}><summary>{r.displayName}</summary>
          <ul>{r.permissions.map(p => <li key={p.kind + p.code}>{p.code}：{p.allowed ? '允許' : '拒絕'}</li>)}</ul></details>)}</details> : null}
        {workspace.selectedDraft?.status === 'APPLIED' ? <p className="access-feedback">此草稿已套用；目前生效版本以首頁選項為準。</p> : null}
        {workspace.selectedDraft?.status === 'OPEN' ? <div className="access-actions">
          <button type="button" className="secondary-button" disabled={!dirty || locked} onClick={() => void save()}><Save size={16} />保存草稿</button>
          <button type="button" className="secondary-button" disabled={!dirty || locked} onClick={() => { discardLocalChanges(); void load(workspace.selectedDraft?.draftId).catch(() => undefined) }}>取消未保存修改</button>
          <button ref={confirmButton} type="button" className="primary-button" disabled={locked || !editable} onClick={() => void save(true)}>確認差異</button></div> : null}
        {preview ? <div className="access-feedback role-policy-confirmation" role="region" aria-label="套用前差異">
          {preview.diff.policyTransition === 'legacy-to-dynamic' ? <p>首次套用將使用七角色分組權限；既有指派與範圍保留。</p> : null}
          <ul>{preview.diff.roleChanges.map((c, i) => <li key={'r' + i}>
            {profiles.find(p => p.stableRoleId === c.stableRoleId)?.presentationName ?? String(c.displayName ?? c.stableRoleId)}：
            {c.type === 'create' ? '新增' : c.type === 'deactivate' ? '停用' : '恢復'}</li>)}
            {preview.diff.capabilityChanges.map((c, i) => <li key={'c' + i}>{profiles.find(p => p.stableRoleId === c.stableRoleId)?.presentationName ?? String(c.stableRoleId)}
              {' '}{workspace.groups.find(a => a.groupId === c.groupId && a.actionId === c.actionId)?.groupLabel}
              {' '}{workspace.groups.find(a => a.groupId === c.groupId && a.actionId === c.actionId)?.actionLabel}：{c.before ? '允許' : '未授予'} → {c.after ? '允許' : '未授予'}</li>)}</ul>
          <label>異動原因<input value={reason} maxLength={240} disabled={locked} onChange={e => setReason(e.target.value)} /></label>
          <button type="button" className="primary-button" disabled={locked || !workspace.admission.apply || !reason.trim()} onClick={() => void apply()}>套用權限</button></div> : null}
      </>}
    <dialog ref={addRoleDialog} aria-labelledby="role-policy-add-role-title" className="role-policy-leave-dialog"
      onCancel={() => setNewRoleName('')}>
      <h3 id="role-policy-add-role-title">新增角色</h3>
      <label>角色名稱<input ref={addRoleInput} value={newRoleName}
        onChange={event => setNewRoleName(event.target.value)} /></label>
      <div className="access-actions">
        <button type="button" className="primary-button" disabled={!newRoleName.trim()} onClick={confirmAddRole}>新增</button>
        <button type="button" className="secondary-button" onClick={() => { addRoleDialog.current?.close(); setNewRoleName('') }}>取消</button>
      </div>
    </dialog>
    <dialog ref={leaveDialog} aria-labelledby="role-policy-leave-title" className="role-policy-leave-dialog"
      onCancel={event => { event.preventDefault(); closeLeaveDialog() }} onKeyDown={handleLeaveKeyDown}>
      <h3 id="role-policy-leave-title">未保存修改</h3><p>尚有未保存修改，請選擇離開前要如何處理。</p><div className="access-actions">
        <button type="button" data-leave-first className="primary-button" disabled={busy} onClick={() => {
          const next = leave; void save().then(ok => { if (ok && next) { closeLeaveDialog(); void next() } })
        }}>保存後離開</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => {
          const next = leave; discardLocalChanges(); closeLeaveDialog(); if (next) void next()
        }}>捨棄修改</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={closeLeaveDialog}>留在此頁</button></div>
    </dialog>
  </section>
}
