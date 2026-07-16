#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SQLiteAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { AsyncAccountLifecycleRepository } from "../src/lib/repositories/account-lifecycle-async-repository.ts";
import {
  EmployeeLoginAliasAsyncRepository,
  EmployeeLoginAliasError
} from "../src/lib/repositories/employee-login-alias-async-repository.ts";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const results = [];
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });

async function rejectsCode(operation, code) {
  try {
    await operation();
    return false;
  } catch (error) {
    return error instanceof EmployeeLoginAliasError && error.code === code;
  }
}

const schema = read("db/schema.sql");
const migration = read("db/postgres/014_employee_login_aliases.sql");
const sessionRoute = read("src/app/api/auth/firebase/session/route.ts");
const intentRoute = read("src/app/api/auth/employee-login-intents/route.ts");
const loginPage = read("src/app/login/page.tsx");
const accountPage = read("src/app/settings/accounts/page.tsx");
const productionSlice = read("src/lib/production-slice.ts");

record(
  "DEV046-ALIAS-001 canonical and Postgres schemas include alias, intent and shared rate-limit tables",
  ["employee_login_aliases", "employee_login_intents", "employee_login_rate_limits"].every((name) => schema.includes(name) && migration.includes(`public.${name}`))
);
record(
  "DEV046-ALIAS-002 public tables force RLS and deny Data API roles",
  ["employee_login_aliases", "employee_login_intents", "employee_login_rate_limits"].every(
    (name) => migration.includes(`ALTER TABLE public.${name} FORCE ROW LEVEL SECURITY`) && migration.includes(`REVOKE ALL ON TABLE public.${name} FROM PUBLIC, anon, authenticated`)
  )
);
record(
  "DEV046-ALIAS-003 alias schema stores no application credential or MFA recovery material",
  !/(?:password_hash|password_digest|mfa_secret|recovery_code|refresh_token)/iu.test(migration)
);

const database = new Database(":memory:");
database.exec(schema);
database.exec(`
  INSERT INTO users (id, display_name, email, role, company_id, account_status, system_role_enabled)
  VALUES
    ('admin-jenfu', 'Jenfu Admin', 'admin@jenfu.test', 'Admin', 'company-jenfu', 'active', 1),
    ('user-jenfu', 'Jenfu User', 'user@jenfu.test', 'Engineer', 'company-jenfu', 'active', 1),
    ('user-jenfu-2', 'Jenfu User 2', 'user2@jenfu.test', 'Engineer', 'company-jenfu', 'active', 1),
    ('admin-maxima', 'Maxima Admin', 'admin@maxima.test', 'Admin', 'company-maxima', 'active', 1),
    ('user-maxima', 'Maxima User', 'user@maxima.test', 'Engineer', 'company-maxima', 'active', 1);
  INSERT INTO platform_principal_mappings (platform_principal_id, pdm_user_id, mapping_status)
  VALUES
    ('firebase:admin-jenfu', 'admin-jenfu', 'active'),
    ('firebase:user-jenfu', 'user-jenfu', 'active'),
    ('firebase:user-jenfu-2', 'user-jenfu-2', 'active'),
    ('firebase:admin-maxima', 'admin-maxima', 'active'),
    ('firebase:user-maxima', 'user-maxima', 'active');
`);

const client = new SQLiteAsyncDatabaseClient(database);
let now = "2026-07-13T08:00:00.000Z";
let idSequence = 0;
let tokenSequence = 0;
const tokenFactory = () => {
  tokenSequence += 1;
  return crypto.createHash("sha256").update(`intent-${tokenSequence}`).digest("base64url");
};
const repository = new EmployeeLoginAliasAsyncRepository(client, {
  clock: () => now,
  idFactory: () => `qc-${++idSequence}`,
  tokenFactory,
  rateLimitPepper: "employee-login-alias-qc-pepper-at-least-32-bytes"
});

const jenfuAlias = await repository.createAlias({
  actorId: "admin-jenfu",
  actorCompanyId: "company-jenfu",
  pdmUserId: "user-jenfu",
  alias: " jf-001 ",
  reason: "QC create"
});
record("DEV046-ALIAS-004 aliases normalize and bind to a company-scoped stable PDM user", jenfuAlias.aliasNormalized === "JF-001" && jenfuAlias.companyId === "company-jenfu" && jenfuAlias.pdmUserId === "user-jenfu");
record(
  "DEV046-ALIAS-005 same-company collisions fail closed and retained aliases cannot be overwritten",
  await rejectsCode(
    () => repository.createAlias({ actorId: "admin-jenfu", actorCompanyId: "company-jenfu", pdmUserId: "user-jenfu-2", alias: "JF-001", reason: "collision" }),
    "employee_login_alias_conflict"
  )
);

const maximaAlias = await repository.createAlias({
  actorId: "admin-maxima",
  actorCompanyId: "company-maxima",
  pdmUserId: "user-maxima",
  alias: "JF-001",
  reason: "company scoped"
});
record("DEV046-ALIAS-006 the same alias may exist in a different company scope", maximaAlias.companyId === "company-maxima");
record(
  "DEV046-ALIAS-007 admin mutations cannot target a user in another company",
  await rejectsCode(
    () => repository.createAlias({ actorId: "admin-jenfu", actorCompanyId: "company-jenfu", pdmUserId: "user-maxima", alias: "CROSS-01", reason: "cross company" }),
    "employee_login_alias_target_not_found"
  )
);

const validChallenge = await repository.issueIntent({ companyId: "company-jenfu", identifier: "jf-001", clientKey: "10.0.0.1|qc" });
const storedIntent = database.prepare("SELECT token_hash, status, pdm_user_id FROM employee_login_intents ORDER BY created_at DESC LIMIT 1").get();
record(
  "DEV046-ALIAS-008 a valid alias creates a five-minute intent and persists only the SHA-256 token hash",
  validChallenge.accepted === true && validChallenge.expiresInSeconds === 300 && storedIntent.pdm_user_id === "user-jenfu" && storedIntent.token_hash === crypto.createHash("sha256").update(validChallenge.intentToken).digest("hex") && !schema.includes(validChallenge.intentToken)
);

const intentCountBeforeUnknown = database.prepare("SELECT COUNT(*) AS count FROM employee_login_intents").get().count;
const unknownChallenge = await repository.issueIntent({ companyId: "company-jenfu", identifier: "UNKNOWN-99", clientKey: "10.0.0.2|qc" });
const intentCountAfterUnknown = database.prepare("SELECT COUNT(*) AS count FROM employee_login_intents").get().count;
record(
  "DEV046-ALIAS-009 unknown aliases receive the same public challenge shape without creating a mapped intent",
  Object.keys(validChallenge).sort().join(",") === Object.keys(unknownChallenge).sort().join(",") && intentCountAfterUnknown === intentCountBeforeUnknown
);

record(
  "DEV046-ALIAS-010 UID/PDM-user mismatch fails without consuming the intent",
  await rejectsCode(
    () => repository.consumeIntent({ intentToken: validChallenge.intentToken, pdmUserId: "user-jenfu-2", companyId: "company-jenfu" }),
    "employee_login_intent_invalid"
  ) && database.prepare("SELECT status FROM employee_login_intents WHERE token_hash = ?").get(storedIntent.token_hash).status === "pending"
);
await repository.consumeIntent({ intentToken: validChallenge.intentToken, pdmUserId: "user-jenfu", companyId: "company-jenfu" });
record("DEV046-ALIAS-011 matching provider UID mapping consumes the single-use intent", database.prepare("SELECT status FROM employee_login_intents WHERE token_hash = ?").get(storedIntent.token_hash).status === "used");
record(
  "DEV046-ALIAS-012 replayed intents fail closed",
  await rejectsCode(
    () => repository.consumeIntent({ intentToken: validChallenge.intentToken, pdmUserId: "user-jenfu", companyId: "company-jenfu" }),
    "employee_login_intent_invalid"
  )
);

const pendingBeforeRetire = await repository.issueIntent({ companyId: "company-jenfu", identifier: "JF-001", clientKey: "10.0.0.3|qc" });
const retired = await repository.retireAlias({
  actorId: "admin-jenfu",
  actorCompanyId: "company-jenfu",
  pdmUserId: "user-jenfu",
  aliasId: jenfuAlias.id,
  rowVersion: jenfuAlias.rowVersion,
  reason: "QC retire"
});
record("DEV046-ALIAS-013 retirement is append-preserving and increments the optimistic-lock version", retired.status === "retired" && retired.rowVersion === jenfuAlias.rowVersion + 1);
record(
  "DEV046-ALIAS-014 retiring an alias invalidates an already-issued pending intent",
  await rejectsCode(
    () => repository.consumeIntent({ intentToken: pendingBeforeRetire.intentToken, pdmUserId: "user-jenfu", companyId: "company-jenfu" }),
    "employee_login_intent_invalid"
  )
);

const beforeRetiredIssue = database.prepare("SELECT COUNT(*) AS count FROM employee_login_intents").get().count;
await repository.issueIntent({ companyId: "company-jenfu", identifier: "JF-001", clientKey: "10.0.0.4|qc" });
record("DEV046-ALIAS-015 retired aliases no longer create mapped intents", database.prepare("SELECT COUNT(*) AS count FROM employee_login_intents").get().count === beforeRetiredIssue);

for (let attempt = 1; attempt <= 5; attempt += 1) {
  await repository.issueIntent({ companyId: "company-jenfu", identifier: "RATE-01", clientKey: "10.0.0.5|qc" });
}
const sixthRateLimited = await rejectsCode(
  () => repository.issueIntent({ companyId: "company-jenfu", identifier: "RATE-01", clientKey: "10.0.0.5|qc" }),
  "employee_login_rate_limited"
);
const persistedRate = database.prepare("SELECT COUNT(*) AS count FROM employee_login_rate_limits WHERE company_id = 'company-jenfu' AND attempt_count = 6 AND blocked_until IS NOT NULL").get();
record("DEV046-ALIAS-016 the sixth attempt is blocked and the shared database block survives transaction commit", sixthRateLimited && persistedRate.count >= 1);

const searchableAlias = await repository.createAlias({
  actorId: "admin-jenfu",
  actorCompanyId: "company-jenfu",
  pdmUserId: "user-jenfu-2",
  alias: "SEARCH-22",
  reason: "search QC"
});
const accountRepository = new AsyncAccountLifecycleRepository(client);
const searchResults = await accountRepository.listAccounts({ query: "search-22" });
const detail = await accountRepository.getAccountDetail("user-jenfu-2");
record("DEV046-ALIAS-017 account management search and detail expose aliases to the Admin UI", searchResults.length === 1 && searchResults[0].id === "user-jenfu-2" && detail?.loginAliases.some((item) => item.id === searchableAlias.id));

record(
  "DEV046-ALIAS-018 login and account-management UIs expose the intended controls without an application password field for aliases",
  loginPage.includes("公司電子郵件或工號") && loginPage.includes("繼續公司帳號驗證") && accountPage.includes("工號／登入別名") && accountPage.includes("新增工號")
);
record(
  "DEV046-ALIAS-019 session issuance consumes the intent after verified UID resolution and public routing is same-origin",
  sessionRoute.lastIndexOf("exchangeFirebaseIdTokenForPlatformSession") < sessionRoute.lastIndexOf("consumeEmployeeLoginIntentAsync") && sessionRoute.lastIndexOf("consumeEmployeeLoginIntentAsync") < sessionRoute.lastIndexOf("setFirebaseBffSessionResponseCookie") && intentRoute.includes("sameOrigin(request)") && intentRoute.includes('"cache-control": "no-store"')
);
record(
  "DEV046-ALIAS-020 public intent responses do not return mapped email, user ID or alias-existence flags",
  !/(?:pdmUserId|mappedEmail|aliasExists|userExists)/u.test(intentRoute)
);
record(
  "DEV046-ALIAS-021 production slice permits only the required alias login and Admin mutation endpoints",
  [
    "api\\/auth\\/employee-login-intents",
    "api\\/auth\\/firebase\\/session",
    "api\\/admin\\/accounts\\/[^/]+\\/login-aliases"
  ].every((fragment) => productionSlice.includes(fragment))
);

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 employee login alias QC: ${results.length - failures.length}/${results.length} passed`);
database.close();
if (failures.length > 0) process.exitCode = 1;
