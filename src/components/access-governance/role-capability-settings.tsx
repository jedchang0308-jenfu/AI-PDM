'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react'
import type { RoleCapabilityPublishedWorkspaceV4 } from '@/lib/ai-pdm-role-capability-contract'

export function RoleCapabilitySettings() {
  const [view, setView] = useState<RoleCapabilityPublishedWorkspaceV4 | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/settings/access/role-capabilities', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok || body.contractVersion !== 'ai-pdm.role-capability-workspace.v4' ||
          body.dataState !== 'current' || body.mutationAllowed !== false || !Array.isArray(body.roles) ||
          body.roles.length === 0) throw new Error('目前無法讀取角色能力，請稍後重試。')
      const current = body as RoleCapabilityPublishedWorkspaceV4
      setView(current)
      setSelectedRoleId(selected => current.roles.some(role => role.catalogRole.stableRoleId === selected)
        ? selected : current.roles[0].catalogRole.stableRoleId)
    } catch (failure) {
      setView(null)
      setError(failure instanceof Error ? failure.message : '目前無法讀取角色能力。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  if (loading) return <section className="access-governance-state" data-testid="role-capability-loading">
    <LoaderCircle size={20} className="access-governance-spin" />載入角色能力...
  </section>
  if (!view) return <section className="access-governance-state is-error" data-testid="role-capability-error" role="alert">
    <ShieldAlert size={20} />{error}
    <button className="secondary-button" type="button" onClick={() => void load()}><RefreshCw size={16} />重試</button>
  </section>
  const selected = view.roles.find(role => role.catalogRole.stableRoleId === selectedRoleId) ?? view.roles[0]
  return <section className="access-governance" data-testid="role-capability-settings">
    <div className="access-governance-layout">
      <nav className="access-role-nav" aria-label="角色能力"><div className="access-role-list">
        {view.roles.map(role => <button key={role.catalogRole.stableRoleId} type="button"
          className={'access-role-nav-item' + (role === selected ? ' is-selected' : '')}
          aria-pressed={role === selected} onClick={() => setSelectedRoleId(role.catalogRole.stableRoleId)}>
          <span><strong>{role.catalogRole.displayName}</strong>
          <small>{role.effectiveWorkspaceHolderCount} 個工作區有效身分</small></span>
        </button>)}
      </div></nav>
      <section className="access-role-detail">
        <header className="access-role-header">
          <div><h2>{selected.catalogRole.displayName}</h2>
            <p>{selected.effectiveWorkspaceHolderCount} 個工作區有效身分</p></div>
          <button className="secondary-button" type="button" onClick={() => void load()} aria-label="重新整理角色能力">
            <RefreshCw size={16} />
          </button>
        </header>
        <div className="access-feedback">
          角色指派由 OrgMaster 管理。
          {view.managementSurface?.href ? <a href={view.managementSurface.href}>前往角色指派</a> : null}
        </div>
        <div className="access-capability-table"><table aria-label={selected.catalogRole.displayName + '能力'}>
          <thead><tr><th scope="col">種類</th><th scope="col">能力</th><th scope="col">允許</th></tr></thead>
          <tbody>{selected.catalogRole.permissions.map(permission => <tr key={permission.kind + ':' + permission.code}>
            <td>{permission.kind === 'page' ? '頁面' : '操作'}</td>
            <td>{permission.code}</td><td>{permission.allowed ? '允許' : '拒絕'}</td>
          </tr>)}</tbody>
        </table></div>
        {selected.catalogRole.allowedScopeKinds.includes('project') ? <p className="access-muted">
          專案範圍的指派請至 OrgMaster 查看。
        </p> : null}
      </section>
    </div>
  </section>
}
