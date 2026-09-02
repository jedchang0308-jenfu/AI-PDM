#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import Database from "better-sqlite3";
import sharp from "sharp";

import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import {
  normalizePartPreviewImage,
  PartPreviewImageValidationError
} from "../src/lib/part-preview-image.ts";
import { isPartWorkbenchPreviewGalleryV1Enabled } from "../src/lib/number-state-flow-feature.ts";
import { PartPreviewService, resolvePartPreviewsAsync } from "../src/lib/pdm-part-preview.ts";
import { PdmCanonicalWorkbenchService } from "../src/lib/pdm-canonical-workbench.ts";
import { CanonicalWorkbenchError } from "../src/lib/pdm-canonical-workbench-contract.ts";

const root = process.cwd();
const checks = [];
function check(id, fn) {
  try {
    const value = fn();
    checks.push({ id, pass: true });
    return value;
  } catch (error) {
    checks.push({ id, pass: false, error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}
async function checkAsync(id, fn) {
  try {
    const value = await fn();
    checks.push({ id, pass: true });
    return value;
  } catch (error) {
    checks.push({ id, pass: false, error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}
async function rejectsCode(input, code) {
  await assert.rejects(() => normalizePartPreviewImage(input), (error) => error instanceof PartPreviewImageValidationError && error.code === code);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}
function apngFixture() {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(64, 0); ihdr.writeUInt32BE(64, 4); ihdr[8] = 8; ihdr[9] = 6;
  const animation = Buffer.alloc(8); animation.writeUInt32BE(2, 0); animation.writeUInt32BE(0, 4);
  const pixels = (red) => {
    const raw = Buffer.alloc((64 * 4 + 1) * 64);
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
      const offset = y * (64 * 4 + 1) + 1 + x * 4;
      raw[offset] = red ? 255 : 0; raw[offset + 1] = red ? 0 : 255; raw[offset + 3] = 255;
    }
    return zlib.deflateSync(raw);
  };
  const frameControl = (sequence) => {
    const chunk = Buffer.alloc(26); chunk.writeUInt32BE(sequence, 0); chunk.writeUInt32BE(64, 4); chunk.writeUInt32BE(64, 8); chunk.writeUInt16BE(1, 20); chunk.writeUInt16BE(10, 22); return chunk;
  };
  const secondData = pixels(false);
  const fd = Buffer.alloc(secondData.length + 4); fd.writeUInt32BE(2, 0); secondData.copy(fd, 4);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("acTL", animation),
    pngChunk("fcTL", frameControl(0)),
    pngChunk("IDAT", pixels(true)),
    pngChunk("fcTL", frameControl(1)),
    pngChunk("fdAT", fd),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const validPng = await sharp({ create: { width: 96, height: 72, channels: 4, background: { r: 24, g: 112, b: 90, alpha: 1 } } }).png().toBuffer();
const orientedJpeg = await sharp({ create: { width: 100, height: 80, channels: 3, background: { r: 40, g: 80, b: 120 } } }).withMetadata({ orientation: 6 }).jpeg({ quality: 72 }).toBuffer();

await checkAsync("PPC-IMG-001 PNG normalizes and hashes server bytes", async () => {
  const result = await normalizePartPreviewImage({ bytes: validPng, fileName: "part.png", declaredMimeType: "image/png" });
  assert.equal(result.format, "png"); assert.equal(result.width, 96); assert.equal(result.height, 72);
  assert.equal(result.sha256, crypto.createHash("sha256").update(result.bytes).digest("hex"));
});
await checkAsync("PPC-IMG-002 JPEG auto-orients and strips metadata", async () => {
  const result = await normalizePartPreviewImage({ bytes: orientedJpeg, fileName: "part.jpeg", declaredMimeType: "image/jpeg" });
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(result.width, 80); assert.equal(result.height, 100); assert.equal(metadata.orientation, undefined); assert.equal(metadata.exif, undefined);
});
await checkAsync("PPC-IMG-003 MIME-extension mismatch fails closed", () => rejectsCode({ bytes: validPng, fileName: "part.jpg", declaredMimeType: "image/png" }, "PART_PREVIEW_IMAGE_TYPE_INVALID"));
await checkAsync("PPC-IMG-004 truncated payload fails decode", () => rejectsCode({ bytes: validPng.subarray(0, 24), fileName: "part.png", declaredMimeType: "image/png" }, "PART_PREVIEW_IMAGE_DECODE_FAILED"));
await checkAsync("PPC-IMG-005 63px boundary is rejected", async () => rejectsCode({ bytes: await sharp({ create: { width: 63, height: 64, channels: 3, background: "white" } }).png().toBuffer(), fileName: "small.png", declaredMimeType: "image/png" }, "PART_PREVIEW_IMAGE_DIMENSION_INVALID"));
await checkAsync("PPC-IMG-006 8193px boundary is rejected", async () => rejectsCode({ bytes: await sharp({ create: { width: 8193, height: 64, channels: 3, background: "white" } }).png().toBuffer(), fileName: "wide.png", declaredMimeType: "image/png" }, "PART_PREVIEW_IMAGE_DIMENSION_INVALID"));
await checkAsync("PPC-IMG-007 APNG is rejected as multi-page", () => rejectsCode({ bytes: apngFixture(), fileName: "animated.png", declaredMimeType: "image/png" }, "PART_PREVIEW_IMAGE_MULTI_PAGE"));
await checkAsync("PPC-IMG-008 unsupported GIF and oversized input fail before activation", async () => {
  await rejectsCode({ bytes: Buffer.from("GIF89a"), fileName: "part.gif", declaredMimeType: "image/gif" }, "PART_PREVIEW_IMAGE_TYPE_INVALID");
  await rejectsCode({ bytes: Buffer.alloc(10 * 1024 * 1024 + 1), fileName: "part.png", declaredMimeType: "image/png" }, "PART_PREVIEW_IMAGE_TOO_LARGE");
});

const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
const db = new Database(":memory:");
db.pragma("foreign_keys = ON");
check("PPC-DB-001 fresh schema and re-run are idempotent", () => { db.exec(schema); db.exec(schema); });
check("PPC-DB-002 seed isolated Part fixtures", () => {
  db.exec(`
    INSERT INTO users (id, display_name, role, company_id) VALUES ('dev065-user', 'DEV-065', 'Admin', 'company-jenfu');
    INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, created_by) VALUES ('dev065-root-a', 'company-jenfu', 'D65A', 'Fixture A', 'manufactured', 'dev065-user');
    INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind) VALUES ('dev065-root-b', 'company-maxima', 'D65B', 'Fixture B', 'manufactured');
    INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, created_by)
      VALUES ('dev065-part-a', 'company-jenfu', 'dev065-root-a', 'D65A-001', 1, '001', 'Fixture Part A', 'manufactured', 'dev065-user');
    INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind)
      VALUES ('dev065-part-b', 'company-maxima', 'dev065-root-b', 'D65B-001', 1, '001', 'Fixture Part B', 'manufactured');
    INSERT INTO file_assets (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id, document_category)
      VALUES ('dev065-asset-a', 'part.png', 'png', 'image/png', 100, '${"a".repeat(64)}', 'part_number', 'dev065-part-a', 'part_preview_image');
    INSERT INTO part_preview_settings (id, company_id, part_number_id, source_mode, file_asset_id, created_by, updated_by)
      VALUES ('dev065-setting-a', 'company-jenfu', 'dev065-part-a', 'custom_image', 'dev065-asset-a', 'dev065-user', 'dev065-user');
  `);
});
check("PPC-DB-003 active custom asset soft-delete is blocked", () => {
  assert.throws(() => db.prepare("UPDATE file_assets SET deleted_at = datetime('now') WHERE id = 'dev065-asset-a'").run(), /PART_PREVIEW_ACTIVE_ASSET/u);
});
check("PPC-DB-004 reset releases asset for normal soft-delete", () => {
  db.prepare("UPDATE part_preview_settings SET source_mode = 'auto', file_asset_id = NULL, row_version = row_version + 1 WHERE id = 'dev065-setting-a'").run();
  db.prepare("UPDATE file_assets SET deleted_at = datetime('now') WHERE id = 'dev065-asset-a'").run();
  assert.ok(db.prepare("SELECT deleted_at FROM file_assets WHERE id = 'dev065-asset-a'").get().deleted_at);
});
check("PPC-DB-005 cross-company Part scope is rejected", () => {
  assert.throws(() => db.prepare("INSERT INTO part_preview_settings (id, company_id, part_number_id, source_mode) VALUES ('bad-company', 'company-jenfu', 'dev065-part-b', 'auto')").run(), /PART_PREVIEW_PART_SCOPE_INVALID/u);
});
check("PPC-DB-006 wrong Part/category/deleted assets are rejected", () => {
  db.prepare("INSERT INTO file_assets (id, file_name, linked_entity_type, linked_entity_id, document_category) VALUES ('wrong-part', 'x.png', 'part_number', 'dev065-part-b', 'part_preview_image')").run();
  db.prepare("INSERT INTO file_assets (id, file_name, linked_entity_type, linked_entity_id, document_category) VALUES ('wrong-category', 'x.png', 'part_number', 'dev065-part-a', 'other')").run();
  for (const id of ["wrong-part", "wrong-category", "dev065-asset-a"]) assert.throws(() => db.prepare("INSERT INTO part_preview_settings (id, company_id, part_number_id, source_mode, file_asset_id) VALUES (?, 'company-jenfu', 'dev065-part-a', 'custom_image', ?)").run(`bad-${id}`, id), /PART_PREVIEW_ASSET_INVALID/u);
});
db.close();

check("PPC-FLAG-001 Part capability requires all three flags", () => {
  const all = { PDM_PART_PREVIEW_V1: "true", PDM_WORKBENCH_PREVIEW_GALLERY_V1: "true", PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true" };
  assert.equal(isPartWorkbenchPreviewGalleryV1Enabled(all), true);
  for (const key of Object.keys(all)) assert.equal(isPartWorkbenchPreviewGalleryV1Enabled({ ...all, [key]: "false" }), false);
});
check("PPC-CONTRACT-001 reserved category is readable but generic upload remains closed", () => {
  const source = fs.readFileSync(path.join(root, "src/lib/repositories/master-attachment-repository.ts"), "utf8");
  assert.match(source, /PartAttachmentCategory[^\n]+part_preview_image/u);
  const setLine = source.split(/\r?\n/u).find((line) => line.includes("const partCategories")) ?? "";
  assert.doesNotMatch(setLine, /part_preview_image/u);
});
check("PPC-CONTRACT-002 resolver uses bulk repositories and no per-card fetch", () => {
  const repository = fs.readFileSync(path.join(root, "src/lib/repositories/pdm-part-preview-async-repository.ts"), "utf8");
  const resolver = fs.readFileSync(path.join(root, "src/lib/pdm-part-preview.ts"), "utf8");
  const gallery = fs.readFileSync(path.join(root, "src/components/canonical-pdm-preview-gallery.tsx"), "utf8");
  assert.match(repository, /listSettingsAndCustomAssets/u); assert.match(repository, /listPrimaryDrawingSources/u); assert.match(repository, /listDerivativeJobs/u);
  assert.match(repository, /state\.data_layer = 'drawing_rd'/u); assert.match(repository, /active_branch\.status = 'open'/u);
  assert.match(resolver, /production\.find[\s\S]+activeRd\.find/u); assert.match(resolver, /"量產預覽"[\s\S]+"研發預覽"/u);
  assert.doesNotMatch(gallery, /\/workbench\/\$\{[^}]+\}\/preview/u);
});

class MemoryStorage {
  provider = "local_repository";
  objects = new Map();
  puts = 0;
  deletes = [];
  async putObject(input) {
    this.puts += 1;
    this.objects.set(input.key, Buffer.from(input.bytes));
    return { provider: this.provider, key: input.key, localPath: `memory/${input.key}`, bytes: input.bytes.length, sha256: crypto.createHash("sha256").update(input.bytes).digest("hex") };
  }
  async getObjectMetadata(key) { const bytes = this.objects.get(key); return bytes ? { provider: this.provider, key, localPath: `memory/${key}`, bytes: bytes.length } : null; }
  async createDownloadUrl(input) { return { provider: this.provider, key: input.key, mode: "server_stream", url: null, expiresInSeconds: 0, expiresAt: null, auditRequired: true, authorizationHeaderRequired: true }; }
  async readObject(key) { const bytes = this.objects.get(key); if (!bytes) throw new Error("MEMORY_OBJECT_NOT_FOUND"); return Buffer.from(bytes); }
  async deleteObject(key) { this.objects.delete(key); this.deletes.push(key); }
  async verifyObjectHash(key, expected) { const bytes = this.objects.get(key); return Boolean(bytes) && crypto.createHash("sha256").update(bytes).digest("hex") === expected; }
}

const commandDb = new Database(":memory:");
commandDb.pragma("foreign_keys = ON");
commandDb.exec(schema);
commandDb.exec(`
  INSERT INTO users (id, display_name, role, company_id) VALUES ('dev065-command-user', 'DEV-065 command', 'Admin', 'company-jenfu');
  INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, created_by) VALUES ('dev065-command-root', 'company-jenfu', 'D65C', 'Command Fixture', 'manufactured', 'dev065-command-user');
  INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, created_by)
    VALUES ('dev065-command-part', 'company-jenfu', 'dev065-command-root', 'D65C-001', 1, '001', 'Command Part', 'manufactured', 'dev065-command-user');
`);
const asyncClient = createAsyncDatabaseClient({ kind: "sqlite", database: commandDb });
const memoryStorage = new MemoryStorage();
const previewService = new PartPreviewService(asyncClient, memoryStorage);
const upload = (name, type, bytes) => ({ name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const secondPng = await sharp({ create: { width: 96, height: 72, channels: 4, background: { r: 125, g: 52, b: 180, alpha: 1 } } }).png().toBuffer();
const thirdPng = await sharp({ create: { width: 96, height: 72, channels: 4, background: { r: 180, g: 92, b: 35, alpha: 1 } } }).png().toBuffer();
const commandInput = (overrides = {}) => ({
  companyId: "company-jenfu", partNumber: "D65C-001", actorId: "dev065-command-user",
  expectedRowVersion: 0, idempotencyKey: "dev065-set-1", correlationId: "dev065-correlation-1",
  file: upload("part.png", "image/png", validPng), ...overrides
});
let firstResult;
await checkAsync("PPC-CMD-001 set custom is atomic and returns resolver projection", async () => {
  firstResult = await previewService.setCustom(commandInput());
  assert.equal(firstResult.settingRowVersion, 1); assert.equal(firstResult.preview.state, "ready"); assert.equal(firstResult.preview.sourceType, "custom_image");
  assert.equal(commandDb.prepare("SELECT COUNT(*) count FROM file_assets WHERE document_category = 'part_preview_image'").get().count, 1);
  assert.equal(commandDb.prepare("SELECT source_mode FROM part_preview_settings WHERE part_number_id = 'dev065-command-part'").get().source_mode, "custom_image");
});
await checkAsync("PPC-CMD-002 identical idempotency replay has no second effect", async () => {
  const puts = memoryStorage.puts;
  const replay = await previewService.setCustom(commandInput());
  assert.deepEqual(replay, firstResult); assert.equal(memoryStorage.puts, puts);
  assert.equal(commandDb.prepare("SELECT COUNT(*) count FROM file_assets WHERE document_category = 'part_preview_image'").get().count, 1);
});
await checkAsync("PPC-CMD-003 reused idempotency key with different normalized bytes is 422", async () => {
  const puts = memoryStorage.puts;
  await assert.rejects(() => previewService.setCustom(commandInput({ file: upload("part.png", "image/png", secondPng) })), (error) => error instanceof CanonicalWorkbenchError && error.code === "IDEMPOTENCY_KEY_REUSED" && error.status === 422);
  assert.equal(memoryStorage.puts, puts);
});
let replaceResult;
await checkAsync("PPC-CMD-004 replace increments version and retains old asset", async () => {
  replaceResult = await previewService.setCustom(commandInput({ expectedRowVersion: 1, idempotencyKey: "dev065-replace-2", correlationId: "dev065-correlation-2", file: upload("replacement.png", "image/png", secondPng) }));
  assert.equal(replaceResult.settingRowVersion, 2);
  assert.equal(commandDb.prepare("SELECT COUNT(*) count FROM file_assets WHERE document_category = 'part_preview_image'").get().count, 2);
});
await checkAsync("PPC-CMD-005 active delete blocks current but not replaced asset", async () => {
  const rows = commandDb.prepare("SELECT id FROM file_assets WHERE document_category = 'part_preview_image' ORDER BY created_at, id").all();
  const current = commandDb.prepare("SELECT file_asset_id FROM part_preview_settings WHERE part_number_id = 'dev065-command-part'").get().file_asset_id;
  const previous = rows.map((row) => row.id).find((id) => id !== current);
  assert.throws(() => commandDb.prepare("UPDATE file_assets SET deleted_at = datetime('now') WHERE id = ?").run(current), /PART_PREVIEW_ACTIVE_ASSET/u);
  commandDb.prepare("UPDATE file_assets SET deleted_at = datetime('now') WHERE id = ?").run(previous);
});
await checkAsync("PPC-CMD-006 stale version rolls back DB and compensates owned stage", async () => {
  const beforeAssets = commandDb.prepare("SELECT COUNT(*) count FROM file_assets").get().count;
  const beforeObjects = memoryStorage.objects.size;
  await assert.rejects(() => previewService.setCustom(commandInput({ expectedRowVersion: 1, idempotencyKey: "dev065-stale", correlationId: "dev065-correlation-stale", file: upload("stale.png", "image/png", thirdPng) })), (error) => error instanceof CanonicalWorkbenchError && error.code === "WORKBENCH_ROW_VERSION_CONFLICT");
  assert.equal(commandDb.prepare("SELECT COUNT(*) count FROM file_assets").get().count, beforeAssets);
  assert.equal(memoryStorage.objects.size, beforeObjects); assert.ok(memoryStorage.deletes.length >= 1);
});
let resetResult;
await checkAsync("PPC-CMD-007 reset keeps setting/asset and returns dynamic auto projection", async () => {
  const assetCount = commandDb.prepare("SELECT COUNT(*) count FROM file_assets").get().count;
  resetResult = await previewService.resetAuto({ companyId: "company-jenfu", partNumber: "D65C-001", actorId: "dev065-command-user", expectedRowVersion: 2, idempotencyKey: "dev065-reset-3", correlationId: "dev065-correlation-3" });
  assert.equal(resetResult.settingRowVersion, 3); assert.equal(resetResult.preview.sourceType, "none"); assert.equal(resetResult.preview.state, "missing");
  const setting = commandDb.prepare("SELECT source_mode, file_asset_id FROM part_preview_settings WHERE part_number_id = 'dev065-command-part'").get();
  assert.equal(setting.source_mode, "auto"); assert.equal(setting.file_asset_id, null); assert.equal(commandDb.prepare("SELECT COUNT(*) count FROM file_assets").get().count, assetCount);
});
await checkAsync("PPC-CMD-008 active review lock rejects command and compensates stage", async () => {
  commandDb.prepare("INSERT INTO approval_requests (id, company_id, action_code, entity_type, entity_id, reason, requested_by) VALUES ('dev065-active-review', 'company-jenfu', 'numbering.release', 'part_number', 'dev065-command-part', 'fixture', 'dev065-command-user')").run();
  const beforeObjects = memoryStorage.objects.size;
  await assert.rejects(() => previewService.setCustom(commandInput({ expectedRowVersion: 3, idempotencyKey: "dev065-locked", correlationId: "dev065-correlation-locked", file: upload("locked.png", "image/png", thirdPng) })), (error) => error instanceof CanonicalWorkbenchError && error.status === 409);
  assert.equal(memoryStorage.objects.size, beforeObjects);
  commandDb.prepare("UPDATE approval_requests SET request_status = 'cancelled' WHERE id = 'dev065-active-review'").run();
});
await checkAsync("PPC-CMD-009 audit failure rolls back setting/asset and compensates stage", async () => {
  commandDb.exec("CREATE TRIGGER dev065_fail_preview_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'numbering.part_preview.set_custom' BEGIN SELECT RAISE(ABORT, 'DEV065_AUDIT_FAULT'); END;");
  const beforeAssets = commandDb.prepare("SELECT COUNT(*) count FROM file_assets").get().count;
  const beforeObjects = memoryStorage.objects.size;
  await assert.rejects(() => previewService.setCustom(commandInput({ expectedRowVersion: 3, idempotencyKey: "dev065-audit-fault", correlationId: "dev065-correlation-audit", file: upload("audit.png", "image/png", thirdPng) })), (error) => error instanceof CanonicalWorkbenchError && error.status === 503);
  assert.equal(commandDb.prepare("SELECT row_version FROM part_preview_settings WHERE part_number_id = 'dev065-command-part'").get().row_version, 3);
  assert.equal(commandDb.prepare("SELECT COUNT(*) count FROM file_assets").get().count, beforeAssets); assert.equal(memoryStorage.objects.size, beforeObjects);
  commandDb.exec("DROP TRIGGER dev065_fail_preview_audit");
});
let concurrentWinner;
await checkAsync("PPC-CMD-010 concurrent expected version produces exactly one winner", async () => {
  const settled = await Promise.allSettled([
    previewService.setCustom(commandInput({ expectedRowVersion: 3, idempotencyKey: "dev065-concurrent-a", correlationId: "dev065-concurrent-a", file: upload("a.png", "image/png", validPng) })),
    previewService.setCustom(commandInput({ expectedRowVersion: 3, idempotencyKey: "dev065-concurrent-b", correlationId: "dev065-concurrent-b", file: upload("b.png", "image/png", thirdPng) }))
  ]);
  const fulfilled = settled.filter((item) => item.status === "fulfilled");
  const rejected = settled.filter((item) => item.status === "rejected");
  assert.equal(fulfilled.length, 1); assert.equal(rejected.length, 1);
  concurrentWinner = fulfilled[0].value;
  assert.equal(concurrentWinner.settingRowVersion, 4);
  assert.ok(rejected[0].reason instanceof CanonicalWorkbenchError && rejected[0].reason.code === "WORKBENCH_ROW_VERSION_CONFLICT");
  assert.equal(commandDb.prepare("SELECT row_version FROM part_preview_settings WHERE part_number_id = 'dev065-command-part'").get().row_version, 4);
});
await checkAsync("PPC-CMD-011 final reset releases current asset and audit stays safe", async () => {
  const current = commandDb.prepare("SELECT file_asset_id FROM part_preview_settings WHERE part_number_id = 'dev065-command-part'").get().file_asset_id;
  const result = await previewService.resetAuto({ companyId: "company-jenfu", partNumber: "D65C-001", actorId: "dev065-command-user", expectedRowVersion: 4, idempotencyKey: "dev065-reset-5", correlationId: "dev065-correlation-5" });
  assert.equal(result.settingRowVersion, 5);
  commandDb.prepare("UPDATE file_assets SET deleted_at = datetime('now') WHERE id = ?").run(current);
  const audits = commandDb.prepare("SELECT action, detail_json FROM audit_logs WHERE action LIKE 'numbering.part_preview.%' ORDER BY created_at, id").all();
  assert.ok(audits.some((row) => row.action === "numbering.part_preview.set_custom"));
  assert.ok(audits.some((row) => row.action === "numbering.part_preview.replace_custom"));
  assert.ok(audits.some((row) => row.action === "numbering.part_preview.reset_auto"));
  assert.ok(audits.every((row) => !/(storage|path|sha256|bytes)/iu.test(row.detail_json)));
});
await checkAsync("PPC-READ-001 auto resolves production-ready then latest active RD-ready in three bulk queries", async () => {
  commandDb.exec(`
    INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, created_by)
      VALUES ('dev065-no-link-part', 'company-jenfu', 'dev065-command-root', 'D65C-002', 2, '002', 'No Link Part', 'manufactured', 'dev065-command-user');
    INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, created_by)
      VALUES ('dev065-linked-no-3d-part', 'company-jenfu', 'dev065-command-root', 'D65C-003', 3, '003', 'Linked No 3D Part', 'manufactured', 'dev065-command-user');
    INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing, created_by)
      VALUES ('dev065-drawing-number', 'company-jenfu', 'dev065-command-root', 'D65C-M01', 'M', 1, 1, 'dev065-command-user');
    INSERT INTO drawings (id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id, part_root_id, purpose_code, sequence_no, is_primary_manufacturing, created_by)
      VALUES ('dev065-drawing', 'company-jenfu', 'D65C-M01', 'released', 'dev065-drawing-number', 'dev065-command-root', 'M', 1, 1, 'dev065-command-user');
    INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by, updated_by)
      VALUES ('dev065-revision', 'company-jenfu', 'dev065-drawing', 'A', 'preparing', 'dev065-command-user', 'dev065-command-user');
    INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, revision_id)
      VALUES ('dev065-drawing-state', 'company-jenfu', 'drawing', 'dev065-drawing', 'drawing_production', 'dev065-revision');
    INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by)
      VALUES ('dev065-primary-link', 'dev065-drawing-number', 'dev065-command-part', 'primary_manufacturing', 'dev065-command-user');
    INSERT INTO file_assets (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id, document_category, uploaded_by)
      VALUES ('dev065-cad-asset', 'D65C-M01.SLDPRT', 'sldprt', 'application/octet-stream', 100, '${"b".repeat(64)}', 'drawing_number', 'dev065-drawing-number', 'cad_3d', 'dev065-command-user');
    INSERT INTO drawing_revision_files (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, is_primary, created_by)
      VALUES ('dev065-cad-binding', 'company-jenfu', 'dev065-revision', 'dev065-cad-asset', 'cad_3d', 'user', 'D65C-M01.SLDPRT', 1, 'dev065-command-user');
    INSERT INTO file_derivatives (id, company_id, source_file_asset_id, source_content_hash, derivative_kind, storage_key, file_name, mime_type, file_size, content_hash, generator_profile, generator_version)
      VALUES ('dev065-cad-derivative', 'company-jenfu', 'dev065-cad-asset', '${"b".repeat(64)}', 'model_preview_png', 'preview/dev065.png', 'dev065.png', 'image/png', 80, '${"c".repeat(64)}', 'windows_solidworks_preview_worker', '1');
    INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by, updated_by, updated_at)
      VALUES
        ('dev065-rd-revision-b', 'company-jenfu', 'dev065-drawing', 'B', 'in_review', 'dev065-command-user', 'dev065-command-user', '2026-08-23T01:00:00.000Z'),
        ('dev065-rd-revision-c', 'company-jenfu', 'dev065-drawing', 'C', 'in_review', 'dev065-command-user', 'dev065-command-user', '2026-08-24T01:00:00.000Z'),
        ('dev065-rd-revision-d', 'company-jenfu', 'dev065-drawing', 'D', 'in_review', 'dev065-command-user', 'dev065-command-user', '2026-08-25T01:00:00.000Z');
    INSERT INTO drawing_rd_branches (id, company_id, drawing_id, latest_approved_revision_id, status, closed_reason, closed_at)
      VALUES
        ('dev065-rd-branch-b', 'company-jenfu', 'dev065-drawing', NULL, 'open', NULL, NULL),
        ('dev065-rd-branch-c', 'company-jenfu', 'dev065-drawing', 'dev065-rd-revision-c', 'open', NULL, NULL),
        ('dev065-rd-branch-d', 'company-jenfu', 'dev065-drawing', NULL, 'historical', 'production_promoted', '2026-08-25T02:00:00.000Z');
    INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, updated_at)
      VALUES
        ('dev065-rd-state-b', 'company-jenfu', 'drawing', 'dev065-drawing', 'drawing_rd', 'dev065-rd-branch-b', 'dev065-rd-revision-b', '2026-08-23T01:00:00.000Z'),
        ('dev065-rd-state-c', 'company-jenfu', 'drawing', 'dev065-drawing', 'drawing_rd', 'dev065-rd-branch-c', 'dev065-rd-revision-c', '2026-08-24T01:00:00.000Z'),
        ('dev065-rd-state-d', 'company-jenfu', 'drawing', 'dev065-drawing', 'drawing_rd', 'dev065-rd-branch-d', 'dev065-rd-revision-d', '2026-08-25T01:00:00.000Z');
    INSERT INTO file_assets (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id, document_category, uploaded_by)
      VALUES
        ('dev065-rd-asset-b', 'D65C-M01-B.SLDPRT', 'sldprt', 'application/octet-stream', 100, '${"d".repeat(64)}', 'drawing_number', 'dev065-drawing-number', 'cad_3d', 'dev065-command-user'),
        ('dev065-rd-asset-c', 'D65C-M01-C.SLDPRT', 'sldprt', 'application/octet-stream', 100, '${"e".repeat(64)}', 'drawing_number', 'dev065-drawing-number', 'cad_3d', 'dev065-command-user'),
        ('dev065-rd-asset-d', 'D65C-M01-D.SLDPRT', 'sldprt', 'application/octet-stream', 100, '${"1".repeat(64)}', 'drawing_number', 'dev065-drawing-number', 'cad_3d', 'dev065-command-user');
    INSERT INTO drawing_revision_files (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, is_primary, created_by, updated_at)
      VALUES
        ('dev065-rd-binding-b', 'company-jenfu', 'dev065-rd-revision-b', 'dev065-rd-asset-b', 'cad_3d', 'user', 'D65C-M01-B.SLDPRT', 1, 'dev065-command-user', '2026-08-23T01:00:00.000Z'),
        ('dev065-rd-binding-c', 'company-jenfu', 'dev065-rd-revision-c', 'dev065-rd-asset-c', 'cad_3d', 'user', 'D65C-M01-C.SLDPRT', 1, 'dev065-command-user', '2026-08-24T01:00:00.000Z'),
        ('dev065-rd-binding-d', 'company-jenfu', 'dev065-rd-revision-d', 'dev065-rd-asset-d', 'cad_3d', 'user', 'D65C-M01-D.SLDPRT', 1, 'dev065-command-user', '2026-08-25T01:00:00.000Z');
    INSERT INTO file_derivatives (id, company_id, source_file_asset_id, source_content_hash, derivative_kind, storage_key, file_name, mime_type, file_size, content_hash, generator_profile, generator_version, created_at)
      VALUES
        ('dev065-rd-derivative-b', 'company-jenfu', 'dev065-rd-asset-b', '${"d".repeat(64)}', 'model_preview_png', 'preview/dev065-rd-b.png', 'dev065-rd-b.png', 'image/png', 80, '${"f".repeat(64)}', 'windows_solidworks_preview_worker', '1', '2026-08-23T01:00:00.000Z'),
        ('dev065-rd-derivative-c', 'company-jenfu', 'dev065-rd-asset-c', '${"e".repeat(64)}', 'model_preview_png', 'preview/dev065-rd-c.png', 'dev065-rd-c.png', 'image/png', 80, '${"a".repeat(64)}', 'windows_solidworks_preview_worker', '1', '2026-08-24T01:00:00.000Z'),
        ('dev065-rd-derivative-d', 'company-jenfu', 'dev065-rd-asset-d', '${"1".repeat(64)}', 'model_preview_png', 'preview/dev065-rd-d.png', 'dev065-rd-d.png', 'image/png', 80, '${"2".repeat(64)}', 'windows_solidworks_preview_worker', '1', '2026-08-25T01:00:00.000Z');
    INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing, created_by)
      VALUES ('dev065-empty-drawing-number', 'company-jenfu', 'dev065-command-root', 'D65C-M02', 'M', 2, 1, 'dev065-command-user');
    INSERT INTO drawings (id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id, part_root_id, purpose_code, sequence_no, is_primary_manufacturing, created_by)
      VALUES ('dev065-empty-drawing', 'company-jenfu', 'D65C-M02', 'building', 'dev065-empty-drawing-number', 'dev065-command-root', 'M', 2, 1, 'dev065-command-user');
    INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by)
      VALUES ('dev065-empty-primary-link', 'dev065-empty-drawing-number', 'dev065-linked-no-3d-part', 'primary_manufacturing', 'dev065-command-user');
  `);
  let queryCount = 0;
  const countingClient = {
    kind: asyncClient.kind,
    query: (...args) => { queryCount += 1; return asyncClient.query(...args); },
    queryOne: (...args) => asyncClient.queryOne(...args),
    execute: (...args) => asyncClient.execute(...args),
    transaction: (...args) => asyncClient.transaction(...args),
    close: () => Promise.resolve()
  };
  const map = await resolvePartPreviewsAsync(countingClient, {
    companyId: "company-jenfu",
    partIds: ["dev065-command-part", "dev065-no-link-part", "dev065-linked-no-3d-part"],
    rowKeysByPartId: {
      "dev065-command-part": ["cw_part_formal", "cw_part_work"],
      "dev065-no-link-part": ["cw_no_link"],
      "dev065-linked-no-3d-part": ["cw_linked_no_3d"]
    }
  });
  assert.equal(queryCount, 3);
  assert.equal(map.cw_part_formal.state, "ready"); assert.deepEqual(map.cw_part_work, map.cw_part_formal);
  assert.equal(map.cw_part_formal.hasPrimaryManufacturingDrawing, true);
  assert.equal(map.cw_part_formal.sourceDrawingNumber, "D65C-M01"); assert.equal(map.cw_part_formal.sourceRevision, "A");
  assert.equal(map.cw_part_formal.sourceLabel, "量產預覽");
  assert.match(map.cw_part_formal.media.href, /^\/api\/pdm\/file-assets\/dev065-cad-asset\?/u);
  assert.equal(map.cw_no_link.sourceType, "none"); assert.equal(map.cw_no_link.state, "missing"); assert.equal(map.cw_no_link.hasPrimaryManufacturingDrawing, false);
  assert.equal(map.cw_linked_no_3d.sourceType, "primary_manufacturing_drawing"); assert.equal(map.cw_linked_no_3d.hasPrimaryManufacturingDrawing, true);
  assert.equal(map.cw_linked_no_3d.sourceDrawingNumber, "D65C-M02"); assert.equal(map.cw_linked_no_3d.state, "missing");

  commandDb.prepare("DELETE FROM file_derivatives WHERE id = 'dev065-cad-derivative'").run();
  const rdMap = await resolvePartPreviewsAsync(asyncClient, {
    companyId: "company-jenfu",
    partIds: ["dev065-command-part"],
    rowKeysByPartId: { "dev065-command-part": ["cw_part_rd"] }
  });
  assert.equal(rdMap.cw_part_rd.state, "ready"); assert.equal(rdMap.cw_part_rd.sourceLabel, "研發預覽");
  assert.equal(rdMap.cw_part_rd.sourceRevision, "C");
  assert.match(rdMap.cw_part_rd.media.href, /^\/api\/pdm\/file-assets\/dev065-rd-asset-c\?/u);
  assert.match(rdMap.cw_part_rd.media.href, /context=candidate_revision/u);

  commandDb.exec(`INSERT INTO file_derivatives (id, company_id, source_file_asset_id, source_content_hash, derivative_kind, storage_key, file_name, mime_type, file_size, content_hash, generator_profile, generator_version)
    VALUES ('dev065-cad-derivative-promoted', 'company-jenfu', 'dev065-cad-asset', '${"b".repeat(64)}', 'model_preview_png', 'preview/dev065-promoted.png', 'dev065-promoted.png', 'image/png', 80, '${"c".repeat(64)}', 'windows_solidworks_preview_worker', '1')`);
  const promotedMap = await resolvePartPreviewsAsync(asyncClient, {
    companyId: "company-jenfu",
    partIds: ["dev065-command-part"],
    rowKeysByPartId: { "dev065-command-part": ["cw_part_promoted"] }
  });
  assert.equal(promotedMap.cw_part_promoted.sourceLabel, "量產預覽");
  assert.equal(promotedMap.cw_part_promoted.sourceRevision, "A");
});
await checkAsync("PPC-READ-002 full Part list/detail stay bounded across 0/1/20/50 rows", async () => {
  const insertPart = commandDb.prepare(`INSERT INTO part_numbers (
    id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, created_by
  ) VALUES (?, 'company-jenfu', 'dev065-command-root', ?, ?, ?, ?, 'manufactured', 'dev065-command-user')`);
  const insertAggregate = commandDb.prepare(`INSERT INTO pdm_workbench_aggregates (
    id, company_id, entity_type, canonical_entity_id
  ) VALUES (?, 'company-jenfu', 'part', ?)`);
  const insertState = commandDb.prepare(`INSERT INTO canonical_workbench_states (
    id, company_id, entity_type, canonical_entity_id, data_layer
  ) VALUES (?, 'company-jenfu', 'part', ?, 'part_formal')`);
  const fixtureParts = [
    { id: "dev065-command-part", number: "D65C-001", sequence: 1 },
    { id: "dev065-no-link-part", number: "D65C-002", sequence: 2 },
    { id: "dev065-linked-no-3d-part", number: "D65C-003", sequence: 3 }
  ];
  for (let sequence = 4; sequence <= 50; sequence += 1) {
    const padded = String(sequence).padStart(3, "0");
    const id = `dev065-query-part-${padded}`;
    insertPart.run(id, `D65C-${padded}`, sequence, padded, `Query Part ${padded}`);
    fixtureParts.push({ id, number: `D65C-${padded}`, sequence });
  }
  for (const part of fixtureParts) {
    insertAggregate.run(`dev065-part-aggregate-${part.sequence}`, part.id);
    insertState.run(`00000000-0000-4000-8000-${String(part.sequence).padStart(12, "0")}`, part.id);
  }
  commandDb.prepare(`UPDATE pdm_workbench_state_authority_control
    SET mode = 'canonical_only', expected_commit = 'local-dev', schema_hash = 'dev090-v1'
    WHERE id = 1`).run();

  const instrument = (base) => {
    const metrics = { statements: 0, transactions: 0 };
    const wrap = (source) => ({
      kind: source.kind,
      query: (...args) => { metrics.statements += 1; return source.query(...args); },
      queryOne: (...args) => { metrics.statements += 1; return source.queryOne(...args); },
      execute: (...args) => { metrics.statements += 1; return source.execute(...args); },
      transaction: (fn, options) => {
        metrics.transactions += 1;
        return source.transaction((transaction) => fn(wrap(transaction)), options);
      },
      close: () => Promise.resolve()
    });
    return { client: wrap(base), metrics };
  };
  const actor = {
    id: "dev065-command-user",
    companyId: "company-jenfu",
    canEditNonOwned: true,
    permissions: {
      createWork: true, updateWork: true, submitWork: true, cancelWork: true,
      decideReview: true, obsoleteDrawing: true, manageAttachments: true
    }
  };
  const originalEnv = {
    PDM_PART_PREVIEW_V1: process.env.PDM_PART_PREVIEW_V1,
    PDM_WORKBENCH_PREVIEW_GALLERY_V1: process.env.PDM_WORKBENCH_PREVIEW_GALLERY_V1,
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: process.env.PDM_UNIFIED_PART_RELATION_WORKBENCH_V1,
    PDM_BUILD_COMMIT: process.env.PDM_BUILD_COMMIT
  };
  Object.assign(process.env, {
    PDM_PART_PREVIEW_V1: "true",
    PDM_WORKBENCH_PREVIEW_GALLERY_V1: "true",
    PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
    PDM_BUILD_COMMIT: "local-dev"
  });
  try {
    const matrix = [
      { key: "0", url: new URL("http://dev065.local/parts?query=NO-SUCH-PART&limit=50"), expected: 0 },
      { key: "1", url: new URL("http://dev065.local/parts?query=D65C-001&limit=50"), expected: 1 },
      { key: "20", url: new URL("http://dev065.local/parts?limit=20"), expected: 20 },
      { key: "50", url: new URL("http://dev065.local/parts?limit=50"), expected: 50 }
    ];
    const listCounts = {};
    let oneRowProjection = null;
    for (const item of matrix) {
      const measured = instrument(asyncClient);
      const response = await new PdmCanonicalWorkbenchService(measured.client).list(item.url, "part", actor);
      const rows = response.data.groups.flatMap((group) => group.rows);
      assert.equal(rows.length, item.expected);
      assert.deepEqual(Object.keys(response.data.previewByRowKey ?? {}).sort(), rows.map((row) => row.rowKey).sort());
      assert.ok(measured.metrics.statements <= 14, `${item.key} rows used ${measured.metrics.statements} statements`);
      assert.equal(measured.metrics.transactions, 1);
      listCounts[item.key] = measured.metrics.statements;
      if (item.key === "1") oneRowProjection = response.data.previewByRowKey?.[rows[0].rowKey] ?? null;
    }
    assert.equal(listCounts["1"], listCounts["20"]);
    assert.equal(listCounts["20"], listCounts["50"]);
    assert.ok(listCounts["0"] <= listCounts["1"]);

    const detailMeasured = instrument(asyncClient);
    const detail = await new PdmCanonicalWorkbenchService(detailMeasured.client).detail("cw_00000000-0000-4000-8000-000000000001", "part", actor);
    assert.ok(detailMeasured.metrics.statements <= 14, `detail used ${detailMeasured.metrics.statements} statements`);
    assert.deepEqual(detail.data.presentation.kind === "part" ? detail.data.presentation.preview : null, oneRowProjection);
    console.log(`EVIDENCE PPC-READ-002 listStatements=${JSON.stringify(listCounts)} detailStatements=${detailMeasured.metrics.statements} listTransactions=1`);
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
await asyncClient.close();
commandDb.close();

for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id}${item.error ? ` — ${item.error}` : ""}`);
const failed = checks.filter((item) => !item.pass);
if (failed.length) {
  console.error(`DEV-065 Part preview focused QC failed: ${failed.length}/${checks.length}`);
  process.exitCode = 1;
} else {
  console.log(`DEV-065 Part preview focused QC passed: ${checks.length} checks; productionConnected=false; productionWrites=false`);
}
