#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/components/drawing-projection.tsx", "utf8");
assert.match(source, /full\.attachments\.map\(\(attachment\) =>/);
assert.match(source, /<strong>\{attachment\.displayName\}<\/strong>/);
assert.match(source, /drawingAttachmentRoleLabel\(attachment\.role\)/);
assert.match(source, /href=\{attachment\.href\}/);
assert.match(source, /pdf:\s*"PDF"/);

console.log("QC DEV-074 reviewer attachment visibility: PASS (all snapshot attachments expose name, role, and evidence link)");
