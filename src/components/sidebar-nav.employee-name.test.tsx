// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({user:{display_name:'Win',employee_name:'張仕杰'} as {display_name:string;employee_name:string|null}, fetch:vi.fn()}))
vi.mock('next/navigation',()=>({usePathname:()=> '/',useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}))
vi.mock('next/link',()=>({default:({children,prefetch:_prefetch,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>&{prefetch?:boolean})=><a {...props}>{children}</a>}))
vi.mock('@/components/pdm-permission-provider',()=>({usePdmPermissions:()=>({state:{kind:'ready',projection:{pages:{},actions:{}}}})}))
vi.mock('@/lib/pdm-permission-client',()=>({pdmPermissionFetch:(...args:unknown[])=>state.fetch(...args),invalidatePdmPermissions:vi.fn()}))
import { SidebarNav } from './sidebar-nav'
afterEach(()=>{vi.clearAllMocks();document.body.innerHTML='';window.localStorage.clear()})
describe('DEV-127 normal sidebar signed-in name',()=>{
  it.each([
    [{display_name:'Win',employee_name:'張仕杰'},'張仕杰'],
    [{display_name:'張仕杰',employee_name:null},'員工'],
    [{display_name:'jedchang0308@jenfu.com.tw',employee_name:null},'員工'],
    [{display_name:'JFS0005',employee_name:'Win'},'員工'],
  ])('renders only a Chinese display or the employee fallback',async(user,expected)=>{
    state.user=user
    state.fetch.mockImplementation(async(url:string)=>({ok:true,json:async()=>url==='/api/auth/me'?{user:state.user}:null}))
    const container=document.createElement('div');document.body.appendChild(container)
    const root=createRoot(container)
    await act(async()=>{root.render(<SidebarNav/>);await Promise.resolve()})
    const logout=container.querySelector('a[title$="登出 AI PDM"]')
    expect(logout?.querySelector('.nav-link-label')?.textContent).toBe(expected)
    expect(logout?.querySelector('.nav-account-status--logout')?.textContent).toBe('登出')
    expect(logout?.getAttribute('title')).toBe(expected+'，登出 AI PDM')
    await act(async()=>root.unmount())
  })
})
