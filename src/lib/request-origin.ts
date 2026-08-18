function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function candidateCloudRunOriginAllowed(origin: string, env: NodeJS.ProcessEnv) {
  const service = String(env.PDM_CANDIDATE_CLOUD_RUN_SERVICE ?? "").trim();
  if (!service) return false;
  const configuredTag = String(env.PDM_CANDIDATE_CLOUD_RUN_TAG ?? "").trim();

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password) return false;
  const servicePattern = escapeRegExp(service);
  const tagPattern = configuredTag
    ? `(?:${escapeRegExp(configuredTag)}|candidate-[a-f0-9]{8}-[0-9]+)`
    : "candidate-[a-f0-9]{8}-[0-9]+";
  const hostnamePattern = new RegExp(
    `^${tagPattern}---${servicePattern}-[a-z0-9-]+\\.a\\.run\\.app$`,
    "u"
  );
  return hostnamePattern.test(parsed.hostname);
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

  return origin === expected || candidateCloudRunOriginAllowed(origin, env);
}
