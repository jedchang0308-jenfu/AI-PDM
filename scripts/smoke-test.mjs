const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const unique = Date.now().toString().slice(-6);

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: process.env.PDM_DEMO_PASSWORD ?? "pdm-demo" })
  });
  if (!response.ok) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const engineerCookie = await login("engineer@example.com");
const managerCookie = await login("manager@example.com");

const form = new FormData();
form.set("drawing_number", `TEST-${unique}`);
form.set("part_number", `P-TEST-${unique}`);
form.set("part_name", "Test Part");
form.set("revision", "A");
form.set("material", "S45C");
form.set("surface_finish", "Black Oxide");
form.set("document_type", "Drawing");
form.set("change_description", "Change hole size for fixture test");
form.append("files", new File([Buffer.from("temporary pdf placeholder")], `TEST-${unique}.pdf`, { type: "application/pdf" }));

const created = await fetch(`${baseUrl}/api/submissions`, {
  method: "POST",
  headers: { cookie: engineerCookie },
  body: form
});
const createBody = await created.json();
if (!created.ok) {
  console.error(JSON.stringify({ createStatus: created.status, createBody }, null, 2));
  process.exit(1);
}

const approved = await fetch(`${baseUrl}/api/submissions/${createBody.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "API smoke test" })
});
const approveBody = await approved.json();
if (!approved.ok) {
  console.error(JSON.stringify({ approveStatus: approved.status, approveBody }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      created: createBody,
      approved: approveBody
    },
    null,
    2
  )
);
