import 'server-only'

import { createHash } from 'node:crypto'
import { canonicalJson } from '@/lib/role-capability-canonical-json'

export function sha256CanonicalJson(value: unknown) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}
