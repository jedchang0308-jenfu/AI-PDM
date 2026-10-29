import type { LocalSandboxConfig } from '../../../contracts/local-principal-sandbox/v1/protocol.mjs'
export type LocalListenerSnapshot = {
  listeners: { address: string; port: number; pid: number }[]
  ancestors?: { pid: number; parentPid: number; startToken: string; endToken: string; executablePath: string }[]
  currentProcess?: { pid: number; executablePath: string }
}
export function parseWindowsTcpListeners(output: string, port: number): LocalListenerSnapshot['listeners']
export function validateLocalListenerSnapshot(snapshot: unknown, expected: { port: number; processId: number; executablePath: string }): string
export function readWindowsLocalListenerSnapshot(port: number, processId?: number): Promise<LocalListenerSnapshot>
export function createLocalListenerVerifier(options?: {
  readSnapshot?: (port: number, processId: number) => Promise<LocalListenerSnapshot>
  processId?: number; executablePath?: string
}): (config: LocalSandboxConfig) => Promise<string>
