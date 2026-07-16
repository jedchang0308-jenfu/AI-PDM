#!/usr/bin/env node

import assert from "node:assert/strict";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();

const uploadPage = readProjectFile(root, "src/app/upload/page.tsx");
const apiClient = readProjectFile(root, "sw-addin/Services/ApiClient.cs");
const submissionWindow = readProjectFile(root, "sw-addin/Views/SubmissionWindow.xaml.cs");
const submissionWindowXaml = readProjectFile(root, "sw-addin/Views/SubmissionWindow.xaml");
const addinModels = readProjectFile(root, "sw-addin/Models/SubmissionResult.cs");
const addinSettings = readProjectFile(root, "sw-addin/Config/AddinSettings.cs");
const preflightRoute = readProjectFile(root, "src/app/api/submissions/preflight-lock/route.ts");
const itemLockRepository = readProjectFile(root, "src/lib/repositories/item-lock-async-repository.ts");

assert.match(uploadPage, /fetch\("\/api\/auth\/me"\)/, "Web upload must load auth company options");
assert.match(uploadPage, /selectedCompanyCode/, "Web upload must track selected company code");
assert.match(uploadPage, /form\.append\("pdm_company_code", selectedCompanyCode\)/, "Web upload must submit company code");
assert.match(uploadPage, /\/api\/file-metadata\/detect/, "Web upload must still call metadata detect");
assert.match(uploadPage, /\/api\/submissions/, "Web upload must still call submission API");

assert.match(addinModels, /class\s+CompanyDto/, "Add-in must define CompanyDto");
assert.match(addinModels, /DataMember\(Name = "default_company"\)/, "Add-in user DTO must map default company");
assert.match(addinModels, /DataMember\(Name = "companies"\)/, "Add-in user DTO must map company list");
assert.match(addinModels, /DataMember\(Name = "pdm_company_code"\)/, "Add-in lock preflight DTO must include company code");

assert.match(addinSettings, /SelectedPdmCompanyCode/, "Add-in settings must persist selected PDM company code");
assert.doesNotMatch(addinSettings, /DataMember\(Name = "(?:sw_)?(?:license|serial)[^"]*"\)/i, "Add-in settings must not store SW license or serial fields");
assert.doesNotMatch(addinSettings, /public\s+\w+\s+(?:Sw)?(?:License|Serial)\w*\s*\{/i, "Add-in settings must not expose SW license or serial properties");

assert.match(submissionWindowXaml, /x:Name="CmbPdmCompany"/, "Add-in submission window must expose company selector");
assert.match(submissionWindow, /PopulatePdmCompanyOptions/, "Add-in submission window must populate company selector");
assert.match(submissionWindow, /finalMetadata\["pdm_company_code"\]/, "Add-in submission window must add company code to metadata");
assert.match(submissionWindow, /GetSelectedPdmCompanyCode/, "Add-in submission window must resolve selected company code");

assert.match(apiClient, /PdmCompanyCode = GetMetadata\(metadata, "pdm_company_code"\)/, "Add-in lock preflight must send company code");
assert.match(apiClient, /foreach \(var pair in metadata\)/, "Add-in multipart submission must include metadata fields");

assert.match(preflightRoute, /parsePdmCompanyCode/, "Preflight route must parse requested PDM company code");
assert.match(preflightRoute, /resolvePdmCompanyContextAsync/, "Preflight route must validate company membership");
assert.match(preflightRoute, /companyId: companyResult\.company\.companyId/, "Preflight route must pass companyId to lock lookup");
assert.match(itemLockRepository, /i\.company_id = :companyId/, "Lock lookup must filter items by company");
assert.match(itemLockRepository, /s_match\.company_id = :companyId/, "Lock lookup must filter drawing matches by company");

console.log(JSON.stringify({
  ok: true,
  checks: [
    "web upload company selector payload",
    "addin token DTO company list",
    "addin submission company selector",
    "addin preflight company payload",
    "backend preflight company scope",
    "no addin license key setting"
  ]
}, null, 2));
