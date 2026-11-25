import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getJenfuSsoHandoffConfig } from '@/lib/auth-config';
import { jenfuSsoStart, jenfuSsoCallback } from '@/lib/jenfu-sso-handoff';

const service = vi.hoisted(() => vi.fn(async (_audience: string) => { throw new Error('TEST_STOP_BEFORE_BROKER'); }));
vi.mock('google-auth-library', async (importOriginal) => ({
  ...await importOriginal<typeof import('google-auth-library')>(),
  GoogleAuth: class { getIdTokenClient(audience: string) { return service(audience); } },
}));

const local = { NODE_ENV:'test', PDM_AUTH_MODE:'firebase_bff', PDM_JENFU_PLATFORM_AUTH_MODE:'on',
  PDM_JENFU_SSO_HANDOFF_MODE:'on', PDM_PUBLIC_BASE_URL:'http://127.0.0.1:3000',
  PDM_JENFU_SSO_BROKER_ORIGIN:'http://localhost:4000' } as const;

beforeEach(()=>{
  for(const [key,value] of Object.entries(local)) vi.stubEnv(key,value);
  vi.stubEnv('K_SERVICE',undefined);
  vi.stubEnv('PDM_SESSION_ISSUER','local-test');vi.stubEnv('PDM_SESSION_AUDIENCE','ai-pdm');
  vi.stubEnv('PDM_SESSION_CURRENT_KEY_ID','test');vi.stubEnv('PDM_SESSION_CURRENT_SECRET','p'.repeat(32));
  vi.stubEnv('PDM_SESSION_PREVIOUS_KEY_ID',undefined);vi.stubEnv('PDM_SESSION_PREVIOUS_SECRET',undefined);
  service.mockClear();vi.spyOn(console,'error').mockImplementation(()=>undefined);
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe('SSO transaction cookie transport',()=>{
  it.each(['access_denied', 'temporarily_unavailable'])('returns a verified %s without exchanging a code and preserves returnTo',async refusal=>{
    const start=await jenfuSsoStart(new Request('http://127.0.0.1:3000/api/auth/jenfu-sso/start?returnTo=%2Fdrawings%3Ftab%3Drecent'));
    const authorize=new URL(start.headers.get('location')!);
    const callback=new URL('/api/auth/jenfu-sso/callback',local.PDM_PUBLIC_BASE_URL);
    callback.search=new URLSearchParams({error:refusal,state:authorize.searchParams.get('state')!,iss:'http://localhost:4000/api/sso'}).toString();
    const response=await jenfuSsoCallback(new Request(callback,{headers:{cookie:start.headers.get('set-cookie')!.split(';')[0]}}));
    const login=new URL(response.headers.get('location')!);
    expect(response.status).toBe(303);expect(login.pathname).toBe('/login');expect(login.origin).toBe(local.PDM_PUBLIC_BASE_URL);
    expect(login.searchParams.get('auth_error')).toBe(refusal==='access_denied'?'sso_access_denied':'sso_dependency_unavailable');
    expect(login.searchParams.get('returnTo')).toBe('/drawings?tab=recent');
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/iu);expect(service).not.toHaveBeenCalled();
  });
  it.each(['state','issuer','missing-cookie','duplicate-cookie','expired','mixed','duplicate-error','unknown-error','extra'])(
    'rejects %s refusal callbacks without accepting cancellation or restarting SSO',async defect=>{
      vi.useFakeTimers();
      try {
        const start=await jenfuSsoStart(new Request('http://127.0.0.1:3000/api/auth/jenfu-sso/start?returnTo=%2Fparts'));
        const authorize=new URL(start.headers.get('location')!);const callback=new URL('/api/auth/jenfu-sso/callback',local.PDM_PUBLIC_BASE_URL);
        callback.search=new URLSearchParams({error:'access_denied',state:authorize.searchParams.get('state')!,iss:'http://localhost:4000/api/sso'}).toString();
        let cookie=start.headers.get('set-cookie')!.split(';')[0];
        if(defect==='state')callback.searchParams.set('state','x'.repeat(22));
        if(defect==='issuer')callback.searchParams.set('iss','https://foreign.example/api/sso');
        if(defect==='missing-cookie')cookie='';
        if(defect==='duplicate-cookie')cookie+='; '+cookie;
        if(defect==='expired')vi.advanceTimersByTime(15*60_000);
        if(defect==='mixed')callback.searchParams.set('code','untrusted-code');
        if(defect==='duplicate-error')callback.searchParams.append('error','access_denied');
        if(defect==='unknown-error')callback.searchParams.set('error','login_required');
        if(defect==='extra')callback.searchParams.set('returnTo','https://foreign.example');
        const response=await jenfuSsoCallback(new Request(callback,{headers:{cookie}}));
        const login=new URL(response.headers.get('location')!);
        expect(login.pathname).toBe('/login');expect(login.searchParams.get('auth_error')).toBe('sso_request_invalid');
        expect(login.searchParams.has('returnTo')).toBe(false);expect(service).not.toHaveBeenCalled();
      } finally {vi.useRealTimers();}
    });
  it('requests Platform reauthentication only from the explicit change-account start',async()=>{
    const start=await jenfuSsoStart(new Request('http://127.0.0.1:3000/api/auth/jenfu-sso/start?reauth=1&returnTo=%2Fparts'));
    expect(new URL(start.headers.get('location')!).searchParams.get('prompt')).toBe('login');
    const invalid=await jenfuSsoStart(new Request('http://127.0.0.1:3000/api/auth/jenfu-sso/start?reauth=0'));
    expect(invalid.status).toBe(400);
  });
  it.each(['http://localhost:3000','http://127.0.0.1:3000','http://[::1]:3000'])(
    'allows HTTP only on explicit development/test loopback: %s',base=>{
      expect(getJenfuSsoHandoffConfig({...local,PDM_PUBLIC_BASE_URL:base}).base).toBe(base);
    });
  it.each<Partial<NodeJS.ProcessEnv>>([
    {NODE_ENV:'production'}, {K_SERVICE:'ai-pdm-prod'}, {PDM_PUBLIC_BASE_URL:'http://pdm.example'},
    {PDM_JENFU_SSO_BROKER_ORIGIN:'http://platform.example'},
    {PDM_PUBLIC_BASE_URL:'https://user:password@pdm.example'},
    {PDM_JENFU_SSO_BROKER_ORIGIN:'https://user:password@platform.example'},
  ])('rejects insecure or credential-bearing configured origins: %j',overrides=>{
    expect(()=>getJenfuSsoHandoffConfig({...local,...overrides})).toThrow();
  });
  it.each([
    ['http://127.0.0.1:3000','ai_pdm_sso_tx',false],
    ['https://pdm.example','__Host-jenfu_sso_tx',true],
  ] as const)('selects one cookie name for %s and reads/clears it on callback',async(base,name,secure)=>{
    vi.stubEnv('PDM_PUBLIC_BASE_URL',base);
    const start=await jenfuSsoStart(new Request(`${base}/api/auth/jenfu-sso/start`));
    expect(start.status).toBe(303);
    const cookie=start.headers.get('set-cookie')!;
    expect(cookie.startsWith(`${name}=`)).toBe(true);
    expect(/; secure/iu.test(cookie)).toBe(secure);
    expect(cookie).toMatch(/; Path=\//iu);expect(cookie).toMatch(/; HttpOnly/iu);expect(cookie).toMatch(/; SameSite=lax/iu);
    expect(cookie).toMatch(/; Max-Age=900/iu);
    expect(cookie).not.toMatch(/; Domain=/iu);
    const location=new URL(start.headers.get('location')!);
    const callback=new URL('/api/auth/jenfu-sso/callback',base);
    callback.search=new URLSearchParams({code:'opaque-test',state:location.searchParams.get('state')!,iss:'http://localhost:4000/api/sso'}).toString();
    const result=await jenfuSsoCallback(new Request(callback,{headers:{cookie:cookie.split(';')[0]}}));
    expect(service).toHaveBeenCalledWith('http://localhost:4000');
    expect(result.status).toBe(303);
    expect(result.headers.get('set-cookie')).toContain(`${name}=`);
    expect(result.headers.get('set-cookie')).toMatch(/Max-Age=0/iu);
  });
  it('rejects the local cookie name on HTTPS before any broker exchange',async()=>{
    vi.stubEnv('PDM_PUBLIC_BASE_URL','https://pdm.example');
    const start=await jenfuSsoStart(new Request('https://pdm.example/api/auth/jenfu-sso/start'));
    const location=new URL(start.headers.get('location')!);
    const callback=new URL('/api/auth/jenfu-sso/callback','https://pdm.example');
    callback.search=new URLSearchParams({code:'opaque-test',state:location.searchParams.get('state')!,iss:'http://localhost:4000/api/sso'}).toString();
    const cookie=start.headers.get('set-cookie')!.split(';')[0].replace('__Host-jenfu_sso_tx=','ai_pdm_sso_tx=');
    const result=await jenfuSsoCallback(new Request(callback,{headers:{cookie}}));
    expect(service).not.toHaveBeenCalled();
    expect(result.headers.get('location')).toContain('auth_error=sso_request_invalid');
  });
  it('restarts an expired 15-minute transaction with a fresh state and PKCE binding',async()=>{
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-02T00:00:00.000Z'));
      const start=await jenfuSsoStart(new Request('http://127.0.0.1:3000/api/auth/jenfu-sso/start?returnTo=%2Fparts'));
      const firstAuthorize=new URL(start.headers.get('location')!);
      const callback=new URL('/api/auth/jenfu-sso/callback','http://127.0.0.1:3000');
      callback.search=new URLSearchParams({code:'expired-code',state:firstAuthorize.searchParams.get('state')!,iss:'http://localhost:4000/api/sso'}).toString();
      vi.advanceTimersByTime(15*60_000);

      const restarted=await jenfuSsoCallback(new Request(callback,{headers:{cookie:start.headers.get('set-cookie')!.split(';')[0]}}));

      expect(restarted.status).toBe(303);
      const freshAuthorize=new URL(restarted.headers.get('location')!);
      expect(freshAuthorize.origin).toBe('http://localhost:4000');
      expect(freshAuthorize.pathname).toBe('/api/sso/authorize');
      expect(freshAuthorize.searchParams.get('state')).not.toBe(firstAuthorize.searchParams.get('state'));
      expect(freshAuthorize.searchParams.get('code_challenge')).not.toBe(firstAuthorize.searchParams.get('code_challenge'));
      expect(restarted.headers.get('set-cookie')).toMatch(/Max-Age=900/iu);
      expect(service).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
