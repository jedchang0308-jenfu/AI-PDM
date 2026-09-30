import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const body = '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI-PDM 維護中</title><body><main><h1>AI-PDM 暫時維護中</h1><p>系統正在進行身分架構切換，請稍後再試。</p></main></body></html>'

export function recoveryResponse(method, pathname) {
  const startupProbe = method === 'GET' && pathname === '/login'
  return {
    status: startupProbe ? 200 : 503,
    headers: {
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'content-type': 'text/html; charset=utf-8',
      'retry-after': '60',
      'x-content-type-options': 'nosniff',
    },
    body,
  }
}

export function createRecoveryServer() {
  return createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const result = recoveryResponse(request.method, pathname)
    response.writeHead(result.status, result.headers)
    response.end(request.method === 'HEAD' ? undefined : result.body)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? '8080')
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('RECOVERY_PORT_INVALID')
  createRecoveryServer().listen(port, '0.0.0.0')
}
