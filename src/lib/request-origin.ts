function exactCandidateOrigin(value: string, canonical: URL) {
  try {
    const candidate = new URL(value);
    const tag = candidate.hostname.slice(0, candidate.hostname.indexOf("---"));
    return candidate.protocol === "https:" && !candidate.port && !candidate.username && !candidate.password && candidate.pathname === "/" && !candidate.search && !candidate.hash && candidate.origin === value && /^candidate-[a-f0-9]{12}$/u.test(tag) && candidate.hostname === `${tag}---${canonical.hostname}`;
  } catch {
    return false;
  }
}

export function isAllowedRequestOrigin(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let expected: string;
  try {
    const configured = String(env.PDM_PUBLIC_BASE_URL ?? "").trim();
    expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  } catch {
    return false;
  }

  if (origin === expected) return true;
  const candidate = String(env.PDM_RELEASE_CANDIDATE_ORIGIN ?? "").trim();
  return Boolean(candidate) && exactCandidateOrigin(candidate, new URL(expected)) && origin === candidate;
}
