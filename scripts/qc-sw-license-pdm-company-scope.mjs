import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const repoRoot = process.cwd();
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-company-scope-"));
const read = (relativePath) => readProjectFile(repoRoot, relativePath);

try {
  const init = spawnSync("npm.cmd run db:init", {
    cwd: repoRoot,
    env: { ...process.env, PDM_DATA_DIR: tempDataDir },
    encoding: "utf8",
    shell: true
  });
  assert.equal(init.status, 0, init.error?.message || init.stderr || init.stdout);

  const db = new Database(path.join(tempDataDir, "ai-pdm.sqlite"), { readonly: true });
  const companies = db.prepare("SELECT company_code FROM companies ORDER BY company_code").all().map((row) => row.company_code);
  assert.deepEqual(companies, ["JENFU", "MAXIMA"]);

  const itemUniqueColumns = uniqueIndexColumns(db, "items");
  assert.ok(
    itemUniqueColumns.some((columns) => columns.join(",") === "company_id,part_number"),
    "items must be unique by company_id + part_number"
  );

  const submissionUniqueColumns = uniqueIndexColumns(db, "submissions");
  assert.ok(
    submissionUniqueColumns.some((columns) => columns.join(",") === "company_id,drawing_number,revision"),
    "submissions must be unique by company_id + drawing_number + revision"
  );
  db.close();

  const routeSource = read("src/app/api/submissions/route.ts");
  assert.match(routeSource, /resolvePdmCompanyContextAsync/);
  assert.match(routeSource, /requestedPdmCompanyCodeFromRequest/);
  assert.match(routeSource, /companyId:\s*companyResult\.company\.companyId/);

  const searchRouteSource = read("src/app/api/search/route.ts");
  assert.match(searchRouteSource, /resolvePdmCompanyContextAsync/);
  assert.match(searchRouteSource, /requestedPdmCompanyCodeFromRequest/);
  assert.match(searchRouteSource, /companyId:\s*companyResult\.company\.companyId/);

  const listRepositorySource = read("src/lib/repositories/submission-list-async-repository.ts");
  assert.match(listRepositorySource, /s\.company_id = :companyId/);

  const metadataSource = read("src/app/api/file-metadata/detect/route.ts");
  assert.match(metadataSource, /resolvePdmCompanyContextAsync/);
  assert.match(metadataSource, /pdmCompany:\s*companyResult\.company/);

  const authSource = read("src/lib/company-context.ts");
  assert.match(authSource, /serializeAuthUserAsync/);
  assert.doesNotMatch(authSource, /license[_-]?key/i);

  const permissionSource = read("src/lib/permissions.ts");
  assert.match(permissionSource, /canReadSubmissionAsync/);
  assert.match(permissionSource, /getUserCompanyAccessAsync/);
  assert.match(permissionSource, /submission\.company_id/);

  for (const relativePath of [
    "src/app/api/submissions/[id]/route.ts",
    "src/lib/file-response.ts",
    "src/app/api/submissions/[id]/release-package/route.ts",
    "src/app/api/submissions/[id]/approve/route.ts",
    "src/app/api/submissions/[id]/reject/route.ts",
    "src/app/api/submissions/[id]/retry-upload/route.ts"
  ]) {
    assert.match(read(relativePath), /await canReadSubmissionAsync/, `${relativePath} must use company-aware submission read checks`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "default companies seeded",
          "items company unique scope",
          "submissions company unique scope",
          "submission API company context",
          "search API company context",
          "metadata detect company context",
          "auth serialization without license key",
          "direct submission read routes use company-aware permissions"
        ]
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(tempDataDir, { recursive: true, force: true });
}

function uniqueIndexColumns(db, tableName) {
  return db
    .prepare(`PRAGMA index_list(${tableName})`)
    .all()
    .filter((index) => Number(index.unique) === 1)
    .map((index) => db.prepare(`PRAGMA index_info(${index.name})`).all().map((column) => column.name));
}
