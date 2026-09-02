const base = (process.env.DEV008_BROWSER_BASE_URL || 'http://localhost:3000').replace(/\/$/u, '')
const response = await fetch(`${base}/settings/workflow`, { redirect: 'manual' })
if (![200, 307, 308].includes(response.status)) throw new Error(`DEV008_BROWSER_ROUTE_FAILED:${response.status}`)
console.log(`DEV008_BROWSER_ROUTE_OK url=${base}/settings/workflow status=${response.status} mutationBoundary=server`) 
