const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`SMOKE login ${email}`, response.ok, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

try {
  const engineerCookie = await login("engineer@example.com");
  await login("manager@example.com");

  const retiredGenericPost = await fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: engineerCookie }
  });
  const retiredBody = await retiredGenericPost.json().catch(() => ({}));
  record(
    "SMOKE retired generic submission factory fails closed",
    retiredGenericPost.status === 410 && retiredBody.error === "GENERIC_SUBMISSION_RETIRED",
    `HTTP ${retiredGenericPost.status}`
  );

  const unauthenticatedList = await fetch(`${baseUrl}/api/numbering/draft-workspaces`);
  record("SMOKE numbering workspace list requires authentication", unauthenticatedList.status === 401, `HTTP ${unauthenticatedList.status}`);

  const previewResponse = await fetch(`${baseUrl}/api/numbering/draft-workspaces/preview?purposeCode=M`, {
    headers: { cookie: engineerCookie }
  });
  const previewBody = await previewResponse.json().catch(() => ({}));
  record("SMOKE official numbering preview returns 200", previewResponse.status === 200, `HTTP ${previewResponse.status}`);
  record(
    "SMOKE official numbering preview returns unreserved candidates",
    previewBody.preview?.reserved === false &&
      typeof previewBody.preview?.root === "string" &&
      typeof previewBody.preview?.part === "string" &&
      typeof previewBody.preview?.drawing === "string",
    JSON.stringify(previewBody.preview ?? {})
  );

  const workspaceResponse = await fetch(`${baseUrl}/api/numbering/draft-workspaces?owner=mine&limit=5`, {
    headers: { cookie: engineerCookie }
  });
  const workspaceBody = await workspaceResponse.json().catch(() => ({}));
  record("SMOKE official numbering workspace list returns 200", workspaceResponse.status === 200, `HTTP ${workspaceResponse.status}`);
  record("SMOKE official numbering workspace response is structured", Array.isArray(workspaceBody.workspaces), JSON.stringify(workspaceBody));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ passed: results.filter((result) => result.passed).length, failed: 1, results, error: message }, null, 2));
  process.exitCode = 1;
}
