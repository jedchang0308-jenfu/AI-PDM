import { describe, expect, it } from 'vitest'
import { NUMBERING_NAV_PERMISSION_BY_PATH, NUMBERING_ACTION_PERMISSION_CODES, permitsNumberingNavigation } from './numbering-permission-codes'
describe('navigation uses the same typed capability as its API', () => {
  it('uses settings action even when a same-named page is denied', () => {
    expect(permitsNumberingNavigation({ pages: { 'settings.admin_matrix': false },
      actions: { 'settings.admin_matrix': true } }, NUMBERING_NAV_PERMISSION_BY_PATH['/settings'])).toBe(true)
  })
  it('requires drawing page and never borrows a same-named action', () => {
    const requirement = NUMBERING_NAV_PERMISSION_BY_PATH['/numbering/drawings']
    expect(requirement).toEqual({ kind: 'page', code: 'numbering.drawings.view' })
    expect(permitsNumberingNavigation({ pages: {}, actions: { 'numbering.drawings.view': true } }, requirement)).toBe(false)
  })
  it('shares actual approval inbox action between nav, permission response and badge', () => {
    expect(NUMBERING_NAV_PERMISSION_BY_PATH['/approvals']).toEqual({ kind: 'action', code: 'approval.inbox.view' })
    expect(NUMBERING_ACTION_PERMISSION_CODES).toContain('approval.inbox.view')
    expect(permitsNumberingNavigation({ pages: { 'numbering.approvals': false },
      actions: { 'approval.inbox.view': true } }, NUMBERING_NAV_PERMISSION_BY_PATH['/approvals'])).toBe(true)
  })
})
