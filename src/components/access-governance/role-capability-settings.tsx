'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, LoaderCircle, Plus, RefreshCw, Save, ShieldAlert } from 'lucide-react'

type ActiveTuple = { catalogVersion: string; catalogSha256: string; activationGeneration: string }
type Permission = { kind: 'page' | 'action'; code: string; allowed: boolean }
type Role = { stableRoleId: string; roleCode: string; displayName: string; roleStatus: 'active' | 'inactive'; permissions: Permission[] }
type Profile = { stableRoleId: string; permissionRoleId: string; presentationName: string; presentationOrder: number;
  assignmentDisposition: 'selectable' | 'legacy-only' | 'hidden-protected' }
type Action = { groupId: string; groupLabel: string; groupOrder: number; actionId: string; actionLabel: string;
  actionOrder: number; code: string }
type Draft = { draftId: string; revision: number; contentHash: string; candidate: { roles: Role[]; roleProfiles: Profile[] } }
type Workspace = { mode: 'DISABLED' | 'ENABLED' | 'PAUSED'; active: ActiveTuple;
  compatibility: { readiness: 'READY' | 'NOT_READY'; compatibility_revision: string } | null;
  groups: Action[]; roles: Role[]; roleProfiles: Profile[]; selectedDraft: Draft | null;
  admission: { read: boolean; edit: boolean; apply: boolean } }
type RoleChange = { type: 'create'; clientRoleId: string; displayName: string }
  | { type: 'deactivate' | 'reactivate'; stableRoleId: string }
type CapabilityChange = { roleRef: { stableRoleId: string } | { clientRoleId: string };
  groupId: string; actionId: string; enabled: boolean }
type Preview = { draftId: string; revision: number; contentHash: string; expectedActive: ActiveTuple;
  compatibilityRevision: string; confirmationHash: string; diff: { roleChanges: unknown[]; capabilityChanges: unknown[] } }

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) } })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.contractVersion !== 'ai-pdm.role-policy-workspace.v3' || !body.data) {
    throw new Error(body?.code ? `操作未完成：${body.code}` : '目前無法讀取角色政策。')
  }
  return body.data as T
}

function actionEnabled(role: Role, action: Action) {
  return role.permissions.some(permission => permission.kind === 'action' && permission.code === action.code && permission.allowed)
}

export function RoleCapabilitySettings() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [roleChanges, setRoleChanges] = useState<RoleChange[]>([])
  const [changes, setChanges] = useState<CapabilityChange[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reason, setReason] = useState('')
  const [view, setView] = useState<'matrix' | 'history'>('matrix')
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (draftId?: string | null) => {
    setLoading(true); setError(null)
    try {
      const data = await requestData<Workspace>(`/api/settings/access/role-policies/workspace${draftId ? `?draftId=${encodeURIComponent(draftId)}` : ''}`)
      setWorkspace(data); setRoles(data.roles); setProfiles(data.roleProfiles)
      const selectable = data.roleProfiles.filter(profile => profile.assignmentDisposition === 'selectable')
      setSelectedRoleId(selected => selectable.some(profile => profile.stableRoleId === selected)
        ? selected : selectable[0]?.stableRoleId ?? null)
      setRoleChanges([]); setChanges([]); setPreview(null)
    } catch (failure) { setWorkspace(null); setError(failure instanceof Error ? failure.message : '目前無法讀取角色政策。') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  const selectableProfiles = useMemo(() => profiles.filter(profile => profile.assignmentDisposition === 'selectable')
    .sort((left, right) => left.presentationOrder - right.presentationOrder), [profiles])
  const selectedProfile = selectableProfiles.find(profile => profile.stableRoleId === selectedRoleId) ?? selectableProfiles[0]
  const selected = roles.find(role => role.stableRoleId === selectedProfile?.permissionRoleId)
  const groups = useMemo(() => [...new Map((workspace?.groups ?? []).map(action => [action.groupId,
    { id: action.groupId, label: action.groupLabel, order: action.groupOrder }])).values()].sort((a, b) => a.order - b.order), [workspace])
  const dirty = roleChanges.length > 0 || changes.length > 0

  async function createDraft() {
    if (!workspace) return
    setBusy(true); setError(null)
    try {
      const result = await requestData<{ draftId: string }>('/api/settings/access/role-policies/drafts', {
        method: 'POST', body: JSON.stringify({ requestId: crypto.randomUUID(), expectedActive: workspace.active })
      })
      await load(result.draftId)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '無法建立草稿。') }
    finally { setBusy(false) }
  }

  function toggle(action: Action, enabled: boolean) {
    if (!selected || !workspace?.selectedDraft) return
    const existing = changes.findIndex(change => 'stableRoleId' in change.roleRef &&
      change.roleRef.stableRoleId === selected.stableRoleId && change.groupId === action.groupId && change.actionId === action.actionId)
    const next: CapabilityChange = { roleRef: { stableRoleId: selected.stableRoleId },
      groupId: action.groupId, actionId: action.actionId, enabled }
    setChanges(current => existing < 0 ? [...current, next] : current.map((change, index) => index === existing ? next : change))
    setRoles(current => current.map(role => role.stableRoleId !== selected.stableRoleId ? role : {
      ...role, permissions: enabled
        ? [...role.permissions.filter(permission => !(permission.kind === 'action' && permission.code === action.code)),
          { kind: 'action' as const, code: action.code, allowed: true }]
        : role.permissions.filter(permission => !(permission.kind === 'action' && permission.code === action.code))
    }))
    setPreview(null)
  }

  function changeStatus() {
    if (!selected || !workspace?.selectedDraft || selected.stableRoleId.startsWith('client-')) return
    const next = selected.roleStatus === 'active' ? 'inactive' : 'active'
    if (next === 'inactive' && !window.confirm('套用後將停止此角色授權；既有指派與歷史會保留，恢復角色後仍可能再次生效。')) return
    setRoleChanges(current => [...current.filter(change => change.type === 'create' || change.stableRoleId !== selected.stableRoleId),
      { type: next === 'active' ? 'reactivate' : 'deactivate', stableRoleId: selected.stableRoleId }])
    setRoles(current => current.map(role => role.stableRoleId === selected.stableRoleId ? { ...role, roleStatus: next } : role))
    setPreview(null)
  }

  function addRole() {
    if (!workspace?.selectedDraft) return
    const displayName = window.prompt('輸入新角色名稱（1–80字）')?.normalize('NFC').trim()
    if (!displayName) return
    const clientRoleId = `client-${crypto.randomUUID()}`
    setRoleChanges(current => [...current, { type: 'create', clientRoleId, displayName }])
    setRoles(current => [...current, { stableRoleId: clientRoleId, roleCode: clientRoleId, displayName,
      roleStatus: 'active', permissions: [] }])
    setProfiles(current => [...current, { stableRoleId: clientRoleId, permissionRoleId: clientRoleId,
      presentationName: displayName, presentationOrder: Math.max(...current.filter(profile => profile.assignmentDisposition === 'selectable')
        .map(profile => profile.presentationOrder)) + 1,
      assignmentDisposition: 'selectable' }])
    setSelectedRoleId(clientRoleId); setPreview(null)
  }

  async function save() {
    const draft = workspace?.selectedDraft
    if (!draft || !dirty) return
    setBusy(true); setError(null)
    try {
      await requestData(`/api/settings/access/role-policies/drafts/${draft.draftId}/save`, { method: 'POST', body: JSON.stringify({
        requestId: crypto.randomUUID(), expectedDraftRevision: draft.revision,
        expectedDraftHash: draft.contentHash, roleChanges,
        changes: changes.map(change => {
          const stableRoleId = 'stableRoleId' in change.roleRef ? change.roleRef.stableRoleId : null
          return stableRoleId?.startsWith('client-') ? { ...change, roleRef: { clientRoleId: stableRoleId } } : change
        })
      }) })
      await load(draft.draftId)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '草稿保存失敗。') }
    finally { setBusy(false) }
  }

  async function loadPreview() {
    const draft = workspace?.selectedDraft
    if (!draft || dirty) return
    setBusy(true); setError(null)
    try { setPreview(await requestData<Preview>(`/api/settings/access/role-policies/drafts/${draft.draftId}/preview?expectedDraftRevision=${draft.revision}&expectedDraftHash=${draft.contentHash}`)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '無法產生差異預覽。') }
    finally { setBusy(false) }
  }

  async function apply() {
    if (!workspace?.selectedDraft || !preview) return
    setBusy(true); setError(null)
    try {
      await requestData('/api/settings/access/role-policies/applications', { method: 'POST', body: JSON.stringify({
        requestId: crypto.randomUUID(), draftId: preview.draftId, expectedDraftRevision: preview.revision,
        expectedDraftHash: preview.contentHash, expectedActive: preview.expectedActive,
        expectedCompatibilityRevision: preview.compatibilityRevision, confirmationHash: preview.confirmationHash, reason
      }) })
      setReason(''); await load()
    } catch (failure) { setError(failure instanceof Error ? failure.message : '套用失敗。') }
    finally { setBusy(false) }
  }

  async function loadHistory() {
    setView('history'); setError(null)
    try { setHistory((await requestData<{ items: Array<Record<string, unknown>> }>('/api/settings/access/role-policies/publications')).items) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '無法讀取版本紀錄。') }
  }

  if (loading) return <section className="access-governance-state"><LoaderCircle size={20} className="access-governance-spin" />載入角色政策...</section>
  if (!workspace) return <section className="access-governance-state is-error" role="alert"><ShieldAlert size={20} />{error}<button className="secondary-button" type="button" onClick={() => void load()}><RefreshCw size={16} />重試</button></section>

  return <section className="access-governance" data-testid="role-policy-settings">
    <header className="access-role-header">
      <div><h2>角色與權限矩陣</h2><p>角色能力由 AI-PDM 管理；人員指派由 OrgMaster 管理。</p></div>
      <div className="access-actions"><button className="secondary-button" type="button" onClick={() => setView('matrix')}>矩陣</button>
        <button className="secondary-button" type="button" onClick={() => void loadHistory()}><History size={16} />版本紀錄</button>
        <button className="secondary-button" type="button" onClick={() => void load(workspace.selectedDraft?.draftId)} aria-label="重新整理"><RefreshCw size={16} /></button></div>
    </header>
    <div className="access-feedback">模式：{workspace.mode}；OrgMaster 相容狀態：{workspace.compatibility?.readiness ?? '無法讀取'}。
      {workspace.mode !== 'ENABLED' || workspace.compatibility?.readiness !== 'READY'
        ? ' 系統會保留草稿，但目前不允許套用。請由負責人確認雙方版本與風險提醒。' : null}</div>
    {error ? <div className="access-governance-state is-error" role="alert"><ShieldAlert size={18} />{error}</div> : null}
    {view === 'history' ? <div className="access-capability-table"><table aria-label="角色政策版本紀錄"><thead><tr><th>版本</th><th>狀態</th><th>格式</th><th>生效序號</th></tr></thead>
      <tbody>{history.map(item => <tr key={String(item.catalogVersion)}><td>{String(item.catalogVersion)}</td><td>{String(item.lifecycle)}</td><td>{String(item.publicationFormat)}</td><td>{String(item.activationGeneration ?? '—')}</td></tr>)}</tbody></table></div>
      : <div className="access-governance-layout"><nav className="access-role-nav" aria-label="角色"><div className="access-role-list">
        {selectableProfiles.map(profile => { const role = roles.find(candidate => candidate.stableRoleId === profile.permissionRoleId); return <button key={profile.stableRoleId} type="button" className={'access-role-nav-item' + (profile === selectedProfile ? ' is-selected' : '')}
          aria-pressed={profile === selectedProfile} onClick={() => setSelectedRoleId(profile.stableRoleId)}><span><strong>{profile.presentationName}</strong><small>{role?.roleStatus === 'inactive' ? '已停用' : '使用中'}</small></span></button> })}
        {workspace.admission.edit && workspace.selectedDraft ? <button className="secondary-button" type="button" onClick={addRole}><Plus size={16} />新增角色</button> : null}
      </div></nav><section className="access-role-detail">
        {!workspace.selectedDraft ? <div className="access-feedback">目前顯示正式版本。{workspace.admission.edit ? <button className="secondary-button" disabled={busy} type="button" onClick={() => void createDraft()}>建立編輯草稿</button> : null}</div> : null}
        {selected ? <><header className="access-role-header"><div><h3>{selectedProfile?.presentationName}</h3><p>{selected.roleStatus === 'active' ? '使用中' : '已停用'}</p></div>
          {workspace.selectedDraft && selectedProfile?.assignmentDisposition === 'selectable' && !selected.stableRoleId.startsWith('client-') ? <button className="secondary-button" type="button" onClick={changeStatus}>{selected.roleStatus === 'active' ? '停用角色' : '恢復角色'}</button> : null}</header>
          <div className="access-capability-table"><table aria-label={`${selectedProfile?.presentationName}權限矩陣`}><thead><tr><th>作業</th>{['view','download','edit','review','publish'].map(action => <th key={action}>{workspace.groups.find(item => item.actionId === action)?.actionLabel}</th>)}</tr></thead>
            <tbody>{groups.map(group => <tr key={group.id}><th scope="row">{group.label}</th>{['view','download','edit','review','publish'].map(actionId => { const action = workspace.groups.find(item => item.groupId === group.id && item.actionId === actionId)!; const unsupported = selected.stableRoleId === 'role-external-specialist' && actionId !== 'view'; return <td key={actionId}><input type="checkbox" checked={actionEnabled(selected, action)} disabled={!workspace.selectedDraft || !workspace.admission.edit || selected.roleStatus !== 'active' || unsupported}
              aria-label={`${selectedProfile?.presentationName} ${group.label} ${action.actionLabel}`} onChange={event => toggle(action, event.target.checked)} /></td> })}</tr>)}</tbody></table></div></> : null}
        {workspace.selectedDraft ? <div className="access-actions"><button className="secondary-button" type="button" disabled={!dirty || busy} onClick={() => void save()}><Save size={16} />保存草稿</button>
          <button className="secondary-button" type="button" disabled={!dirty || busy} onClick={() => void load(workspace.selectedDraft?.draftId)}>取消未保存修改</button>
          <button className="secondary-button" type="button" disabled={dirty || busy} onClick={() => void loadPreview()}>預覽差異</button></div> : null}
        {preview ? <div className="access-feedback"><p>角色變更 {preview.diff.roleChanges.length} 項；能力變更 {preview.diff.capabilityChanges.length} 項。</p>
          <label>套用原因<input value={reason} maxLength={240} onChange={event => setReason(event.target.value)} /></label>
          <button className="primary-button" type="button" disabled={busy || !reason.trim() || workspace.mode !== 'ENABLED' || workspace.compatibility?.readiness !== 'READY'} onClick={() => void apply()}>確認並套用</button></div> : null}
      </section></div>}
  </section>
}
