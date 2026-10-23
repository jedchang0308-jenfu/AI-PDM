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
});
