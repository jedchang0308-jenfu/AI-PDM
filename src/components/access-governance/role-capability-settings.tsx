'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, LoaderCircle, RefreshCw, Save, Settings2, ShieldAlert, X } from 'lucide-react'
import type { RoleCapabilityEmployee, RoleCapabilityMutationResponse, RoleCapabilityPosition, RoleCapabilityWorkspaceV2, RoleCapabilityWorkspaceV3 } from '@/lib/ai-pdm-role-capability-contract'
import { sha256CanonicalJson } from '@/lib/role-capability-canonical-json'
import { resolveRoleCapabilityCommandUnknown } from '@/lib/repositories/ai-pdm-role-capability-repository'

type Feedback = { type: 'error' | 'success'; text: string }
type RoleCapabilityWorkspace = RoleCapabilityWorkspaceV2 | RoleCapabilityWorkspaceV3
type RoleCapabilityRole = RoleCapabilityWorkspace['roles'][number]
type ReviewDraft =
  | { type: 'position'; adoptedPositionIds: string[] }
  | { type: 'sources'; changes: Array<{ employeeId: string; positionId: string; selected: boolean }> }

function sourceKey(positionId: string, employeeId: string) {
  return `${positionId}\0${employeeId}`
}

function randomCommandId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `role-capability-${Date.now()}`
}

function displayDate(value: string | null) {
  if (!value) return '無期限'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-TW')
}

function isPrivilegedWorkspace(view: RoleCapabilityWorkspace | null): view is RoleCapabilityWorkspaceV3 {
  return view?.contractVersion === 'ai-pdm.role-capability-workspace.v3'
}

function isPrivilegedRole(view: RoleCapabilityRole): view is RoleCapabilityWorkspaceV3['roles'][number] {
  return 'managementKind' in view && view.managementKind === 'privileged_principal'
}

function holderCount(view: RoleCapabilityRole) {
  if (isPrivilegedRole(view)) return view.effectiveHolderCount
  return new Set(view.projection.positions.flatMap((position) => position.employees.filter((employee) => employee.effectiveHolder).map((employee) => employee.employeeId))).size
}

function adoptionSummary(view: RoleCapabilityRole) {
  if (isPrivilegedRole(view)) return view.holderCountLabel
  const positions = view.projection.positions.filter((position) => position.adopted)
  if (!positions.length) return '尚未採用職位'
  return `${positions.length} 個職位`
}

export function RoleCapabilitySettings() {
  const [view, setView] = useState<RoleCapabilityWorkspace | null>(null)
  const [roleOptions, setRoleOptions] = useState<RoleCapabilityWorkspaceV2['roles']>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [positionDialogOpen, setPositionDialogOpen] = useState(false)
  const [positionDraft, setPositionDraft] = useState<string[]>([])
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null)
  const [sourceDraft, setSourceDraft] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<{ commandId: string; requestHash: string } | null>(null)

  async function load(roleId?: string) {
    setLoading(true)
    setFeedback(null)
    try {
      const query = roleId ? `?stableRoleId=${encodeURIComponent(roleId)}` : ''
      const response = await fetch(`/api/settings/access/role-capabilities${query}`, { cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as RoleCapabilityWorkspace & { error?: string }
      if (!response.ok) { if (body.contractVersion && body.dataState) setView(body); throw new Error(body.error ?? '角色能力讀取失敗') }
      setView(body)
      if (body.contractVersion === 'ai-pdm.role-capability-workspace.v2') {
        setRoleOptions((current) => {
          if (!roleId) return body.roles
          const next = new Map(current.map((role) => [role.catalogRole.stableRoleId, role]))
          for (const role of body.roles) next.set(role.catalogRole.stableRoleId, role)
          return [...next.values()]
        })
      }
      setSelectedRoleId((current) => current && body.roles.some((role) => role.catalogRole.stableRoleId === current) ? current : body.roles[0]?.catalogRole.stableRoleId ?? null)
      setSourceDraft({})
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : '角色能力讀取失敗' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem('ai-pdm-role-capability-pending-command')
      if (raw) {
        const parsed = JSON.parse(raw) as { commandId?: unknown; requestHash?: unknown }
        if (typeof parsed.commandId === 'string' && typeof parsed.requestHash === 'string') setPendingCommand({ commandId: parsed.commandId, requestHash: parsed.requestHash })
      }
    } catch { /* unavailable storage must not block the page */ }
    void load()
  }, [])

  const selected = isPrivilegedWorkspace(view)
    ? view.roles[0] ?? null
    : view?.roles.find((role) => role.catalogRole.stableRoleId === selectedRoleId) ?? view?.roles[0] ?? null
  const selectedRoleIdResolved = selected?.catalogRole.stableRoleId ?? null
  const sourceChanges = useMemo(() => {
    if (!selected || isPrivilegedRole(selected)) return []
    return selected.projection.positions.flatMap((position) => position.employees.map((employee) => {
      const key = sourceKey(position.positionId, employee.employeeId)
      const next = sourceDraft[key]
      return next === undefined || next === employee.sourceSelected ? null : { employeeId: employee.employeeId, positionId: position.positionId, selected: next }
    }).filter((change): change is { employeeId: string; positionId: string; selected: boolean } => change !== null))
  }, [selected, sourceDraft])

  async function selectRole(roleId: string) {
    if (roleId === selectedRoleIdResolved) return
    if (sourceChanges.length > 0 && !window.confirm('目前有人員來源尚未發布，切換角色會捨棄這些變更。要繼續嗎？')) return
    setSourceDraft({})
    setReviewDraft(null)
    setSelectedRoleId(roleId)
    if (roleId === 'role-system-admin' || isPrivilegedWorkspace(view)) {
      setView(null)
      await load(roleId)
    }
  }

  function openPositionSettings() {
    if (!selected || isPrivilegedRole(selected)) return
    const initial = selected.projection.adoptionState === 'uninitialized'
      ? selected.projection.positions.filter((position) => position.recommended).map((position) => position.positionId)
      : selected.projection.positions.filter((position) => position.adopted).map((position) => position.positionId)
    setPositionDraft(initial)
    setPositionDialogOpen(true)
  }

  function positionDraftChanged() {
    if (!selected || isPrivilegedRole(selected)) return false
    const baseline = selected.projection.positions.filter((position) => position.adopted).map((position) => position.positionId).sort()
    return JSON.stringify([...positionDraft].sort()) !== JSON.stringify(baseline) || selected.projection.adoptionState === 'uninitialized'
  }

  async function publishReview(reason: string) {
    if (!selected || isPrivilegedRole(selected) || !reviewDraft || !view || isPrivilegedWorkspace(view) || !view.mutationAllowed) return
    setSaving(true)
    setFeedback(null)
    try {
      const operation = reviewDraft.type === 'position' ? 'set_position_adoptions' : 'set_assignment_sources'
      const payload = reviewDraft.type === 'position'
        ? { stableRoleId: selectedRoleIdResolved, operation, adoptedPositionIds: reviewDraft.adoptedPositionIds }
        : { stableRoleId: selectedRoleIdResolved, operation, changes: reviewDraft.changes }
      const base = { ...payload, baseProjectionCursor: view?.projectionCursor ?? 0, reason: reason.trim(), expectedCatalogVersion: view.catalogVersion, expectedCatalogPayloadHash: view.catalogPayloadHash, expectedGovernanceRevision: view.governanceRevision, expectedOrganizationRevision: view.organizationRevision }
      const previewResponse = await fetch('/api/settings/access/role-capabilities/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(base) })
      const previewBody = await previewResponse.json().catch(() => ({})) as RoleCapabilityMutationResponse & { error?: string }
      if (!previewResponse.ok) throw new Error(previewBody.error ?? '角色變更預覽失敗')
      if (previewBody.status === 'noop') {
        setReviewDraft(null)
        setPositionDialogOpen(false)
        return
      }
      const commandId = randomCommandId()
      const requestHash = sha256CanonicalJson(base)
      const publishResponse = await fetch('/api/settings/access/role-capabilities/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...base, commandId, requestHash }) })
      const published = await publishResponse.json().catch(() => ({})) as RoleCapabilityMutationResponse & { error?: string }
      if (!publishResponse.ok) {
        if (published.error === 'ORGMASTER_OUTCOME_UNKNOWN' || published.error === 'ORGMASTER_GOVERNANCE_OUTCOME_UNKNOWN') {
          const pending = { commandId, requestHash }
          setPendingCommand(pending)
          try { window.sessionStorage.setItem('ai-pdm-role-capability-pending-command', JSON.stringify(pending)) } catch { /* best effort */ }
        }
        throw new Error(published.error ?? '角色變更發布失敗')
      }
      setReviewDraft(null)
      setPositionDialogOpen(false)
      setSourceDraft({})
      await load()
      setFeedback({ type: 'success', text: '角色能力已更新' })
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : '角色變更發布失敗' })
    } finally {
      setSaving(false)
    }
  }

  if (loading && !view) {
    return <section className="access-governance-state" data-testid="role-capability-loading"><LoaderCircle size={20} className="access-governance-spin" />載入角色能力...</section>
  }
  if (!view || !selected) {
    return <section className="access-governance-state is-error" data-testid="role-capability-error"><ShieldAlert size={20} />{feedback?.text ?? view?.dependency.decisionCode ?? '角色能力目前無法使用'}<button className="secondary-button" type="button" onClick={() => void load()}><RefreshCw size={16} />重試</button></section>
  }

  const privileged = isPrivilegedWorkspace(view)
  const ordinarySelected = selected && !isPrivilegedRole(selected) ? selected : null
  const adoptedPositions = ordinarySelected?.projection.positions.filter((position) => position.adopted) ?? []
  const canSetPositions = !privileged && !!ordinarySelected && view.mutationAllowed && ordinarySelected.catalogRole.recommendationAllowed && ordinarySelected.projection.positions.length > 0
  const navigationRoles: RoleCapabilityRole[] = roleOptions.length > 0 ? roleOptions : (view?.roles ?? [])
  const roleHeaderSummary = isPrivilegedRole(selected)
    ? `風險：${selected.catalogRole.riskLevel}・${selected.holderCountLabel}`
    : `風險：${selected.catalogRole.risk}・目前持有人 ${holderCount(selected)} 人`

  return (
    <section className="access-governance-page" data-testid="role-capability-page">
      <div className="access-governance-layout">
        <aside className="access-role-nav" aria-label="AI-PDM 角色">
          <div className="access-role-nav-header">
            <div>
              <span className="access-eyebrow">AI-PDM</span>
              <h2>角色能力</h2>
            </div>
            <button className="icon-button" type="button" aria-label="重新載入角色能力" title="重新載入" onClick={() => void load()} disabled={loading}><RefreshCw size={17} /></button>
          </div>
          <div className="access-role-list">
            {navigationRoles.map((role) => {
              const currentRole = privileged && role.catalogRole.stableRoleId === 'role-system-admin' && selected ? selected : role
              const navigationSummary = privileged && !isPrivilegedRole(currentRole) ? '一般角色' : adoptionSummary(currentRole)
              return <button key={role.catalogRole.stableRoleId} className={`access-role-nav-item${role.catalogRole.stableRoleId === selectedRoleIdResolved ? ' is-selected' : ''}`} type="button" onClick={() => void selectRole(role.catalogRole.stableRoleId)}>
                <span><strong>{currentRole.catalogRole.displayName}</strong><small>{navigationSummary}</small></span>
                <span className="access-role-count">{holderCount(currentRole)}</span>
              </button>
            })}
          </div>
        </aside>

        <section className="access-role-main" aria-label={`${selected.catalogRole.displayName}角色設定`}>
          <header className="access-role-header">
            <div>
              <span className="access-eyebrow">{selected.catalogRole.roleCode}</span>
              <h2>{selected.catalogRole.displayName}</h2>
              <p>{roleHeaderSummary}</p>
            </div>
            {canSetPositions ? <button className="primary-button" type="button" onClick={openPositionSettings}><Settings2 size={16} />職位設定</button> : null}
          </header>

          {feedback ? <div className={`access-feedback is-${feedback.type}`} role="status">{feedback.text}</div> : null}
          {privileged ? <PrivilegedRoleCapabilityContent view={view} /> : <>
            {view.dataState === 'stale_snapshot' ? <div className="access-feedback is-error" role="status">OrgMaster 暫時離線；目前顯示最後成功快照（資料時間：{view.sourceDataAt ?? '未知'}、快照時間：{view.snapshotStoredAt ?? '未知'}）。目前為唯讀，請恢復連線後重新載入。</div> : null}
            <div className="access-position-list" aria-label="已採用職位與人員">
              {adoptedPositions.length === 0 ? (
                <div className="access-empty"><Settings2 size={20} /><p>尚未採用職位</p>{canSetPositions ? <button className="secondary-button" type="button" onClick={openPositionSettings}>開啟職位設定</button> : null}</div>
              ) : adoptedPositions.map((position) => (
                <PositionCapabilityRow key={position.positionId} position={position} sourceDraft={sourceDraft} disabled={!view.mutationAllowed} onSourceChange={(employee, checked) => setSourceDraft((current) => ({ ...current, [sourceKey(position.positionId, employee.employeeId)]: checked }))} />
              ))}
            </div>
            {sourceChanges.length > 0 ? <div className="access-action-bar"><span>{sourceChanges.length} 項人員來源變更</span><button className="primary-button" type="button" disabled={!view.mutationAllowed} onClick={() => setReviewDraft({ type: 'sources', changes: sourceChanges })}>儲存人員來源<Save size={16} /></button></div> : null}
          </>}
          <div className="access-sync-meta">OrgMaster projection cursor {view.projectionCursor}・組織版本 {view.organizationVersionId}・資料時間 {view.sourceDataAt ?? '未知'}</div>
          {!privileged && pendingCommand ? <div className="access-feedback is-error" role="alert">發布結果尚未確認（commandId {pendingCommand.commandId}）。<button className="secondary-button" type="button" onClick={async () => { try { const receipt = await resolveRoleCapabilityCommandUnknown(pendingCommand.commandId, pendingCommand.requestHash); setPendingCommand(null); try { window.sessionStorage.removeItem('ai-pdm-role-capability-pending-command') } catch { /* best effort */ } setFeedback({ type: 'success', text: `已確認命令結果：${String((receipt as { decisionCode?: string }).decisionCode ?? (receipt as { receiptStatus?: string }).receiptStatus)}` }) } catch (error) { setFeedback({ type: 'error', text: error instanceof Error ? error.message : '命令結果仍未確認' }) } }}>確認結果</button></div> : null}
        </section>
      </div>

      {positionDialogOpen && ordinarySelected ? <PositionSettingsDialog positions={ordinarySelected.projection.positions} selectedPositionIds={positionDraft} onToggle={(positionId, checked) => setPositionDraft((current) => checked ? [...new Set([...current, positionId])] : current.filter((id) => id !== positionId))} onClose={() => setPositionDialogOpen(false)} onSave={() => { setPositionDialogOpen(false); setReviewDraft({ type: 'position', adoptedPositionIds: positionDraft }) }} saveDisabled={!positionDraftChanged()} /> : null}
      {reviewDraft && ordinarySelected ? <RoleChangeReviewDialog selected={ordinarySelected} draft={reviewDraft} saving={saving} onClose={() => setReviewDraft(null)} onPublish={publishReview} /> : null}
    </section>
  )
}

function PrivilegedRoleCapabilityContent({ view }: { view: RoleCapabilityWorkspaceV3 }) {
  const activeAssignments = view.roles[0]?.manualAssignments.filter((assignment) => assignment.status === 'active') ?? []
  return <section className="access-privileged-role" data-testid="privileged-role-capability">
    <div className="access-privileged-summary">
      <span className="access-eyebrow">OrgMaster governance</span>
      <h3>由 OrgMaster 管理</h3>
      <p>此角色不使用職位，只能指派給已准入的個人特權身分。</p>
      {view.managementSurface?.href ? <a className="primary-button" href={view.managementSurface.href}>前往 OrgMaster 角色指派</a> : <p className="access-muted">請從 OrgMaster 開啟角色治理 → 角色指派，選擇 AI-PDM／系統管理員。</p>}
    </div>
    {view.dataState === 'stale_snapshot' ? <div className="access-feedback is-error" role="status">OrgMaster 離線；目前顯示最後成功快照（資料時間：{view.sourceDataAt ?? '未知'}）。目前僅可查看，無法修改。</div> : null}
    {view.dataState === 'unavailable' ? <div className="access-feedback is-error" role="status">OrgMaster 目前無法使用；本頁不提供特權身分修改，也不以快照授權。</div> : null}
    <section className="access-privileged-holders" aria-label="目前特權身分">
      <header><div><span className="access-eyebrow">Current holders</span><h3>目前特權身分</h3></div><strong>{view.roles[0]?.holderCountLabel ?? '特權身分 0 個'}</strong></header>
      {activeAssignments.length === 0 ? <p className="access-muted">目前沒有已發布的特權身分。</p> : <ul>{activeAssignments.map((assignment) => <li key={assignment.assignmentId}><span><strong>員工 {assignment.employeeId}</strong><small>{assignment.principalHint}</small></span><small>資料參考：{assignment.auditReference}</small></li>)}</ul>}
    </section>
  </section>
}

function PositionCapabilityRow({ position, sourceDraft, disabled, onSourceChange }: { position: RoleCapabilityPosition; sourceDraft: Record<string, boolean>; disabled: boolean; onSourceChange: (employee: RoleCapabilityEmployee, checked: boolean) => void }) {
  return (
    <section className="access-position-row">
      <header className="access-position-header">
        <div><h3>{position.displayName}</h3><p>{position.departmentName ?? '未分部門'}・{position.employees.length} 位任職者</p></div>
        <span className="access-position-state">已採用</span>
      </header>
      <div className="access-employee-list">
        {position.employees.length === 0 ? <span className="access-muted">目前無有效任職者</span> : position.employees.map((employee) => {
          const checked = sourceDraft[sourceKey(position.positionId, employee.employeeId)] ?? employee.sourceSelected
          return <label className="access-employee-row" key={employee.employeeId}><input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onSourceChange(employee, event.target.checked)} /><span><strong>{employee.displayName}</strong><small>{employee.assignmentType === 'acting' ? '代理任職' : '正式任職'}・有效至 {displayDate(employee.assignmentValidUntil)}</small></span>{checked ? <span className="access-employee-status">{employee.effectiveHolder ? '已發布' : '待發布'}</span> : null}</label>
        })}
      </div>
    </section>
  )
}

function PositionSettingsDialog({ positions, selectedPositionIds, onToggle, onClose, onSave, saveDisabled }: { positions: RoleCapabilityPosition[]; selectedPositionIds: string[]; onToggle: (positionId: string, checked: boolean) => void; onClose: () => void; onSave: () => void; saveDisabled: boolean }) {
  const [query, setQuery] = useState('')
  const filtered = positions.filter((position) => `${position.displayName} ${position.departmentName ?? ''}`.toLocaleLowerCase('zh-TW').includes(query.trim().toLocaleLowerCase('zh-TW')))
  return <div className="access-dialog-backdrop" role="presentation"><section className="access-dialog" role="dialog" aria-modal="true" aria-labelledby="position-settings-title"><header className="access-dialog-header"><div><span className="access-eyebrow">OrgMaster Position</span><h2 id="position-settings-title">職位設定</h2></div><button className="icon-button" type="button" aria-label="關閉職位設定" onClick={onClose}><X size={18} /></button></header><p className="access-dialog-helper">勾選完成後按「儲存職位設定」，下一步可補充原因並確認發布。</p><input className="access-dialog-search" aria-label="搜尋職位" placeholder="搜尋職位或部門" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="access-position-options">{filtered.map((position) => <label className="access-position-option" key={position.positionId}><input type="checkbox" checked={selectedPositionIds.includes(position.positionId)} onChange={(event) => onToggle(position.positionId, event.target.checked)} /><span><strong>{position.displayName}</strong><small>{position.departmentName ?? '未分部門'}・{position.employees.length} 位任職者{position.recommended ? '・（建議）' : ''}</small></span></label>)}{filtered.length === 0 ? <span className="access-muted">找不到有效職位</span> : null}</div><footer className="access-dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" onClick={onSave} disabled={saveDisabled}><Save size={16} />儲存職位設定</button></footer></section></div>
}

function RoleChangeReviewDialog({ selected, draft, saving, onClose, onPublish }: { selected: RoleCapabilityWorkspaceV2['roles'][number]; draft: ReviewDraft; saving: boolean; onClose: () => void; onPublish: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const current = new Set(selected.projection.positions.filter((position) => position.adopted).map((position) => position.positionId))
  const next = draft.type === 'position' ? new Set(draft.adoptedPositionIds) : current
  const added = draft.type === 'position' ? [...next].filter((id) => !current.has(id)) : []
  const removed = draft.type === 'position' ? [...current].filter((id) => !next.has(id)) : []
  const affected = draft.type === 'sources' ? new Set(draft.changes.map((change) => change.employeeId)).size : new Set(selected.projection.positions.filter((position) => added.includes(position.positionId) || removed.includes(position.positionId)).flatMap((position) => position.employees.map((employee) => employee.employeeId))).size
  const disabled = saving
  return <div className="access-dialog-backdrop" role="presentation"><section className="access-dialog access-review-dialog" role="dialog" aria-modal="true" aria-labelledby="role-review-title"><header className="access-dialog-header"><div><span className="access-eyebrow">儲存前確認</span><h2 id="role-review-title">{draft.type === 'position' ? '確認儲存職位設定' : '確認儲存人員來源'}</h2></div><button className="icon-button" type="button" aria-label="關閉儲存確認" onClick={onClose} disabled={saving}><X size={18} /></button></header><dl className="access-review-summary"><div><dt>角色</dt><dd>{selected.catalogRole.displayName}</dd></div><div><dt>{draft.type === 'position' ? '職位新增' : '來源變更'}</dt><dd>{draft.type === 'position' ? `${added.length} 個` : `${draft.changes.length} 項`}</dd></div><div><dt>{draft.type === 'position' ? '職位移除' : '影響人員'}</dt><dd>{draft.type === 'position' ? `${removed.length} 個` : `${affected} 人`}</dd></div><div><dt>受影響人員</dt><dd>{affected} 人</dd></div></dl><p className="access-review-note">移除最後一個有效來源的人員將撤銷此角色；新任職者不會自動取得角色。</p><label className="access-reason-field"><span>儲存原因（選填）</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="可補充本次儲存原因" rows={3} maxLength={240} /></label><footer className="access-dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>返回</button><button className="primary-button" type="button" onClick={() => onPublish(reason)} disabled={disabled}>{saving ? <LoaderCircle size={16} className="access-governance-spin" /> : <Save size={16} />}儲存並發布</button></footer></section></div>
}
