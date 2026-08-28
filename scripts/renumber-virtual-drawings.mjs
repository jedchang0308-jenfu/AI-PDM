import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const root = process.cwd();
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const reportDir = path.join(root, "data", "quality");
const backupRoot = path.join(root, "data", "backups");
const apply = process.argv.includes("--apply");
const check = process.argv.includes("--check");
const now = new Date().toISOString();
const stamp = now.replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

const drawingPattern = /^D-\d{4}-(MA|OT)\d$/;
const partPattern = /^P-\d{4}-\d{3}$/;

function isStandardDrawing(value) {
  return drawingPattern.test(String(value ?? "").trim());
}

function isStandardPart(value) {
  return partPattern.test(String(value ?? "").trim());
}

function padRoot(index) {
  return String(index).padStart(4, "0");
}

function alphaSerial(index) {
  let current = index;
  let output = "";
  while (current >= 0) {
    output = String.fromCharCode(65 + (current % 26)) + output;
    current = Math.floor(current / 26) - 1;
  }
  return output;
}

function cleanToken(value, fallback) {
  const token = String(value ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return token || fallback;
}

function normalizeSeries(row) {
  const source = cleanToken(row.product_line || row.project_code || row.customer || "", "");
  if (!source || /^(QC|TEST|DEMO|SEED|VIRT|PAGE|UIE2E|DETAIL|ASM|FIND|QUICK|ASSIST)/i.test(source)) {
    return "JF";
  }
  return source.slice(0, 12).toUpperCase();
}

function normalizeFeature(row) {
  const material = cleanToken(row.material, "標準");
  const finishRaw = String(row.surface_finish ?? "").trim();
  const finishMap = new Map([
    ["black oxide", "黑染"],
    ["nitrided", "氮化"],
    ["anodized", "陽極"],
    ["polished", "拋光"],
    ["none", ""],
    ["n/a", ""],
    ["-", ""]
  ]);
  const finish = finishMap.get(finishRaw.toLowerCase()) ?? cleanToken(finishRaw, "");
  return finish ? `${material}_${finish}` : material;
}

function classifyCoreName(row) {
  const text = [row.document_type, row.part_name, row.drawing_number, row.change_description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/(assembly|asm|組立|組件|總成)/.test(text)) return "組立件";
  if (/(bracket|腳架|支架)/.test(text)) return "腳架";
  if (/(belt|鋼帶)/.test(text)) return "鋼帶";
  if (/(screw|bolt|螺絲)/.test(text)) return "螺絲";
  if (/(motor|馬達)/.test(text)) return "馬達";
  return "零件";
}

function drawingUseCode(row) {
  const text = [row.document_type, row.part_name, row.drawing_number, row.change_description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(concept|explode|explosion|other|參考|概念|爆炸)/.test(text) ? "OT" : "MA";
}

function sortByCreatedAtThenId(a, b) {
  const dateCompare = String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  if (dateCompare !== 0) return dateCompare;
  return String(a.id).localeCompare(String(b.id));
}

function isReleasedLike(row) {
  return row.status === "Released" || row.status === "Obsolete";
}

function buildRevisionPlan(submissions) {
  const ordered = [...submissions].sort(sortByCreatedAtThenId);
  let major = 0;
  let preReleaseMinor = 0;
  let postReleaseMinor = 0;
  const revisions = new Map();

  for (const row of ordered) {
    if (isReleasedLike(row)) {
      major += 1;
      postReleaseMinor = 0;
      revisions.set(row.id, `V${major}`);
      continue;
    }

    if (major === 0) {
      preReleaseMinor += 1;
      revisions.set(row.id, `V0.${preReleaseMinor}`);
    } else {
      postReleaseMinor += 1;
      revisions.set(row.id, `V${major}.${postReleaseMinor}`);
    }
  }

  return revisions;
}

function buildFileName(originalFilename, mapping) {
  const ext = path.extname(originalFilename || "");
  const lowerExt = ext.toLowerCase();
  const drawingRoot = mapping.newDrawingNumber.replace(/-(MA|OT)\d$/, "");
  const base = [".sldprt", ".sldasm", ".step", ".stp", ".iges", ".igs"].includes(lowerExt)
    ? `${drawingRoot}_${mapping.newRevision}`
    : `${mapping.newDrawingNumber}_${mapping.newRevision}`;
  return `${base}${ext || ""}`;
}

function normalizeRevision(value) {
  const revision = String(value ?? "").trim();
  if (!revision) return value;
  if (/^V\d+(?:\.\d+)?$/i.test(revision)) return revision.toUpperCase();
  if (/^[A-Z]$/i.test(revision)) return `V${revision.toUpperCase().charCodeAt(0) - 64}`;
  return "V1";
}

function replaceKnownIdentifiers(filename, row, maps) {
  let output = filename;
  if (!output) return output;

  const partMapping = row.referenced_part_number ? maps.byOldPart.get(row.referenced_part_number) : null;
  if (partMapping) {
    output = output.split(row.referenced_part_number).join(partMapping.newPartNumber);
  }

  const drawingMapping = row.referenced_drawing_number ? maps.byOldDrawing.get(row.referenced_drawing_number) : null;
  if (drawingMapping) {
    output = output.split(row.referenced_drawing_number).join(drawingMapping.newDrawingNumber);
  }

  const revisionMapping =
    partMapping && row.referenced_revision
      ? maps.byOldPartRevision.get(`${row.referenced_part_number}\u0000${row.referenced_revision}`)
      : null;
  if (revisionMapping && row.referenced_revision) {
    output = output.split(row.referenced_revision).join(revisionMapping.newRevision);
  }

  return output;
}

function isNonstandardRefPart(value) {
  const partNumber = String(value ?? "").trim();
  return partNumber && !isStandardPart(partNumber);
}

function isNonstandardRefDrawing(value) {
  const drawingNumber = String(value ?? "").trim();
  return drawingNumber && !isStandardDrawing(drawingNumber);
}

function collectExternalReferencePlan(db) {
  const usedRoots = new Set(
    db
      .prepare("SELECT part_number FROM items WHERE part_number GLOB 'P-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9]'")
      .all()
      .map((row) => Number(String(row.part_number).slice(2, 6)))
  );
  let nextRoot = 9000;
  const byPart = new Map();
  const byDrawing = new Map();

  function nextExternalRoot() {
    while (usedRoots.has(nextRoot)) nextRoot += 1;
    if (nextRoot > 9999) {
      throw new Error("External reference renumbering exceeded P-9999-001 / D-9999-MA1 capacity.");
    }
    usedRoots.add(nextRoot);
    return padRoot(nextRoot++);
  }

  function ensurePart(oldPartNumber) {
    if (!isNonstandardRefPart(oldPartNumber)) return null;
    if (!byPart.has(oldPartNumber)) {
      const root = nextExternalRoot();
      byPart.set(oldPartNumber, {
        oldPartNumber,
        newPartNumber: `P-${root}-001`,
        newDrawingNumber: `D-${root}-MA1`
      });
    }
    return byPart.get(oldPartNumber);
  }

  for (const row of db.prepare("SELECT DISTINCT referenced_part_number, referenced_drawing_number FROM file_references").all()) {
    const partMapping = ensurePart(row.referenced_part_number);
    if (partMapping && isNonstandardRefDrawing(row.referenced_drawing_number)) {
      byDrawing.set(row.referenced_drawing_number, partMapping);
      continue;
    }
    if (isNonstandardRefDrawing(row.referenced_drawing_number) && !byDrawing.has(row.referenced_drawing_number)) {
      const root = nextExternalRoot();
      byDrawing.set(row.referenced_drawing_number, {
        oldDrawingNumber: row.referenced_drawing_number,
        newPartNumber: `P-${root}-001`,
        newDrawingNumber: `D-${root}-MA1`
      });
    }
  }

  return { byPart, byDrawing };
}

function validateNoDuplicatePlannedKeys(plannedSubmissions, plannedItems) {
  const errors = [];
  const drawingRevisionKeys = new Set();
  const partNumbers = new Set();

  for (const row of plannedSubmissions.values()) {
    const key = `${row.newDrawingNumber}\u0000${row.newRevision}`;
    if (drawingRevisionKeys.has(key)) {
      errors.push(`duplicate planned drawing/revision: ${row.newDrawingNumber} ${row.newRevision}`);
    }
    drawingRevisionKeys.add(key);
  }

  for (const row of plannedItems.values()) {
    if (partNumbers.has(row.newPartNumber)) {
      errors.push(`duplicate planned part number: ${row.newPartNumber}`);
    }
    partNumbers.add(row.newPartNumber);
  }

  return errors;
}

function collectPlan(db) {
  const rows = db
    .prepare(
      `
      SELECT
        s.id,
        s.item_id,
        s.drawing_number,
        s.revision,
        s.status,
        s.material,
        s.surface_finish,
        s.document_type,
        s.change_description,
        s.created_at,
        s.product_line,
        s.customer,
        s.project_code,
        i.part_number,
        i.part_name
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      ORDER BY i.created_at, i.id, s.created_at, s.id
      `
    )
    .all();

  const targetRows = rows.filter((row) => !isStandardDrawing(row.drawing_number) || !isStandardPart(row.part_number));
  const byItem = new Map();
  for (const row of targetRows) {
    if (!byItem.has(row.item_id)) byItem.set(row.item_id, []);
    byItem.get(row.item_id).push(row);
  }

  const itemIds = [...byItem.keys()].sort((a, b) => {
    const firstA = byItem.get(a)[0];
    const firstB = byItem.get(b)[0];
    return sortByCreatedAtThenId(firstA, firstB);
  });

  const plannedItems = new Map();
  const plannedSubmissions = new Map();
  const partNameBuckets = new Map();

  itemIds.forEach((itemId, itemIndex) => {
    const itemRows = [...byItem.get(itemId)].sort(sortByCreatedAtThenId);
    const representative = itemRows[0];
    const root = padRoot(itemIndex + 1);
    const newPartNumber = `P-${root}-001`;
    const newDrawingNumber = `D-${root}-${drawingUseCode(representative)}1`;
    const partNamePrefix = `${classifyCoreName(representative)}_${normalizeSeries(representative)}_${normalizeFeature(representative)}`;
    const bucketIndex = partNameBuckets.get(partNamePrefix) ?? 0;
    partNameBuckets.set(partNamePrefix, bucketIndex + 1);
    const newPartName = `${partNamePrefix}_${alphaSerial(bucketIndex)}`;
    const revisionPlan = buildRevisionPlan(itemRows);

    plannedItems.set(itemId, {
      itemId,
      oldPartNumber: representative.part_number,
      oldPartName: representative.part_name,
      newPartNumber,
      newPartName,
      currentRevision: revisionPlan.get(itemRows[itemRows.length - 1].id)
    });

    for (const row of itemRows) {
      plannedSubmissions.set(row.id, {
        submissionId: row.id,
        itemId,
        oldDrawingNumber: row.drawing_number,
        oldRevision: row.revision,
        oldPartNumber: row.part_number,
        newDrawingNumber,
        newRevision: revisionPlan.get(row.id),
        newPartNumber,
        newPartName
      });
    }
  });

  const validationErrors = validateNoDuplicatePlannedKeys(plannedSubmissions, plannedItems);

  const byOldPart = new Map();
  const byOldDrawing = new Map();
  const byOldPartRevision = new Map();
  const byOldDrawingRevision = new Map();

  for (const item of plannedItems.values()) {
    if (!byOldPart.has(item.oldPartNumber)) byOldPart.set(item.oldPartNumber, item);
  }

  for (const submission of plannedSubmissions.values()) {
    const oldDrawingExisting = byOldDrawing.get(submission.oldDrawingNumber);
    if (!oldDrawingExisting) byOldDrawing.set(submission.oldDrawingNumber, submission);
    if (oldDrawingExisting && oldDrawingExisting.newDrawingNumber !== submission.newDrawingNumber) {
      byOldDrawing.delete(submission.oldDrawingNumber);
    }

    const partRevisionKey = `${submission.oldPartNumber}\u0000${submission.oldRevision}`;
    const oldPartRevisionExisting = byOldPartRevision.get(partRevisionKey);
    if (!oldPartRevisionExisting) byOldPartRevision.set(partRevisionKey, submission);
    if (oldPartRevisionExisting && oldPartRevisionExisting.newRevision !== submission.newRevision) {
      byOldPartRevision.delete(partRevisionKey);
    }

    const drawingRevisionKey = `${submission.oldDrawingNumber}\u0000${submission.oldRevision}`;
    const oldDrawingRevisionExisting = byOldDrawingRevision.get(drawingRevisionKey);
    if (!oldDrawingRevisionExisting) byOldDrawingRevision.set(drawingRevisionKey, submission);
    if (oldDrawingRevisionExisting && oldDrawingRevisionExisting.newRevision !== submission.newRevision) {
      byOldDrawingRevision.delete(drawingRevisionKey);
    }
  }

  return {
    totalSubmissions: rows.length,
    targetSubmissions: plannedSubmissions.size,
    targetItems: plannedItems.size,
    plannedItems,
    plannedSubmissions,
    maps: { byOldPart, byOldDrawing, byOldPartRevision, byOldDrawingRevision },
    validationErrors
  };
}

function applyPlan(db, plan) {
  const updateItem = db.prepare("UPDATE items SET part_number = ?, part_name = ?, current_revision = ?, updated_at = ? WHERE id = ?");
  const updateSubmission = db.prepare("UPDATE submissions SET drawing_number = ?, revision = ?, updated_at = ? WHERE id = ?");
  const updateFileReference = db.prepare(
    "UPDATE file_references SET source_filename = ?, referenced_filename = ?, referenced_part_number = ?, referenced_drawing_number = ?, referenced_revision = ? WHERE id = ?"
  );
  const updateSubmissionFile = db.prepare("UPDATE submission_files SET original_filename = ? WHERE id = ?");
  const updateReleasePackage = db.prepare("UPDATE release_packages SET package_filename = ? WHERE id = ?");

  const transaction = db.transaction(() => {
    for (const item of plan.plannedItems.values()) {
      updateItem.run(item.newPartNumber, item.newPartName, item.currentRevision, now, item.itemId);
    }

    for (const submission of plan.plannedSubmissions.values()) {
      updateSubmission.run(submission.newDrawingNumber, submission.newRevision, now, submission.submissionId);
    }

    const fileNameById = new Map();

    if (plan.plannedSubmissions.size > 0) {
      const submissionIds = [...plan.plannedSubmissions.keys()];
      const fileRows = db
        .prepare(
          `
          SELECT sf.id, sf.submission_id, sf.original_filename
          FROM submission_files sf
          WHERE sf.submission_id IN (${submissionIds.map(() => "?").join(",")})
          `
        )
        .all(...submissionIds);
      for (const row of fileRows) {
        const mapping = plan.plannedSubmissions.get(row.submission_id);
        const newFilename = buildFileName(row.original_filename, mapping);
        fileNameById.set(row.id, newFilename);
        updateSubmissionFile.run(newFilename, row.id);
      }

      const releaseRows = db
        .prepare(
          `
          SELECT id, submission_id
          FROM release_packages
          WHERE submission_id IN (${submissionIds.map(() => "?").join(",")})
          `
        )
        .all(...submissionIds);
      for (const row of releaseRows) {
        const mapping = plan.plannedSubmissions.get(row.submission_id);
        updateReleasePackage.run(`${mapping.newDrawingNumber}_${mapping.newRevision}_release-package.zip`, row.id);
      }
    }

    for (const row of db.prepare("SELECT * FROM file_references").all()) {
      const partMapping = row.referenced_part_number ? plan.maps.byOldPart.get(row.referenced_part_number) : null;
      const drawingMapping = row.referenced_drawing_number ? plan.maps.byOldDrawing.get(row.referenced_drawing_number) : null;
      const revisionMapping =
        row.referenced_part_number && row.referenced_revision
          ? plan.maps.byOldPartRevision.get(`${row.referenced_part_number}\u0000${row.referenced_revision}`)
          : row.referenced_drawing_number && row.referenced_revision
            ? plan.maps.byOldDrawingRevision.get(`${row.referenced_drawing_number}\u0000${row.referenced_revision}`)
            : null;
      const sourceFilename = row.source_file_id && fileNameById.has(row.source_file_id)
        ? fileNameById.get(row.source_file_id)
        : row.source_filename;
      const referencedFilename = replaceKnownIdentifiers(row.referenced_filename, row, plan.maps);

      if (
        partMapping ||
        drawingMapping ||
        revisionMapping ||
        sourceFilename !== row.source_filename ||
        referencedFilename !== row.referenced_filename
      ) {
        updateFileReference.run(
          sourceFilename,
          referencedFilename,
          partMapping?.newPartNumber ?? row.referenced_part_number,
          drawingMapping?.newDrawingNumber ?? row.referenced_drawing_number,
          revisionMapping?.newRevision ?? row.referenced_revision,
          row.id
        );
      }
    }
  });

  transaction();
}

function applyExternalReferencePlan(db, externalPlan) {
  const updateFileReference = db.prepare(
    "UPDATE file_references SET source_filename = ?, referenced_filename = ?, referenced_part_number = ?, referenced_drawing_number = ?, referenced_revision = ? WHERE id = ?"
  );

  const transaction = db.transaction(() => {
    const refRows = db
      .prepare(
        `
        SELECT fr.*, sf.original_filename AS current_source_filename
        FROM file_references fr
        JOIN submission_files sf ON sf.id = fr.source_file_id
        `
      )
      .all();

    for (const row of refRows) {
      const partMapping = externalPlan.byPart.get(row.referenced_part_number);
      const drawingMapping = externalPlan.byDrawing.get(row.referenced_drawing_number);
      const effectiveMapping = partMapping ?? drawingMapping;
      const newPartNumber = partMapping?.newPartNumber ?? row.referenced_part_number;
      const newDrawingNumber = effectiveMapping?.newDrawingNumber ?? row.referenced_drawing_number;
      const newRevision = effectiveMapping ? normalizeRevision(row.referenced_revision) : row.referenced_revision;
      const newSourceFilename = row.current_source_filename ?? row.source_filename;
      let newReferencedFilename = row.referenced_filename;

      if (row.referenced_filename && effectiveMapping) {
        newReferencedFilename = row.referenced_filename;
        if (row.referenced_part_number) {
          newReferencedFilename = newReferencedFilename.split(row.referenced_part_number).join(newPartNumber ?? "");
        }
        if (row.referenced_drawing_number) {
          newReferencedFilename = newReferencedFilename.split(row.referenced_drawing_number).join(newDrawingNumber ?? "");
        }
        if (row.referenced_revision) {
          newReferencedFilename = newReferencedFilename.split(row.referenced_revision).join(newRevision ?? "");
        }
      }

      if (
        newPartNumber !== row.referenced_part_number ||
        newDrawingNumber !== row.referenced_drawing_number ||
        newRevision !== row.referenced_revision ||
        newSourceFilename !== row.source_filename ||
        newReferencedFilename !== row.referenced_filename
      ) {
        updateFileReference.run(newSourceFilename, newReferencedFilename, newPartNumber, newDrawingNumber, newRevision, row.id);
      }
    }
  });

  transaction();
}

function postCheck(db) {
  return db
    .prepare(
      `
      SELECT
        COUNT(*) AS submissions,
        SUM(CASE WHEN s.drawing_number GLOB 'D-[0-9][0-9][0-9][0-9]-MA[0-9]' OR s.drawing_number GLOB 'D-[0-9][0-9][0-9][0-9]-OT[0-9]' THEN 0 ELSE 1 END) AS nonstandard_drawings,
        SUM(CASE WHEN i.part_number GLOB 'P-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9]' THEN 0 ELSE 1 END) AS nonstandard_parts,
        COUNT(DISTINCT i.part_number) AS distinct_parts,
        COUNT(DISTINCT i.id) AS distinct_items,
        (SELECT COUNT(*) FROM file_references WHERE referenced_part_number IS NOT NULL AND referenced_part_number != '' AND referenced_part_number NOT GLOB 'P-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9]') AS nonstandard_reference_parts,
        (SELECT COUNT(*) FROM file_references WHERE referenced_drawing_number IS NOT NULL AND referenced_drawing_number != '' AND referenced_drawing_number NOT GLOB 'D-[0-9][0-9][0-9][0-9]-MA[0-9]' AND referenced_drawing_number NOT GLOB 'D-[0-9][0-9][0-9][0-9]-OT[0-9]') AS nonstandard_reference_drawings,
        (SELECT COUNT(*) FROM file_references fr JOIN submission_files sf ON sf.id = fr.source_file_id WHERE fr.source_filename != sf.original_filename) AS reference_source_filename_mismatch
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      `
    )
    .get();
}

if (!fs.existsSync(dbPath)) {
  throw new Error(`Database not found: ${dbPath}`);
}

fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(backupRoot, { recursive: true });

const db = new Database(dbPath);
try {
  const plan = collectPlan(db);
  const externalPlan = collectExternalReferencePlan(db);
  if (plan.validationErrors.length > 0) {
    throw new Error(`Planned renumbering is not unique:\n${plan.validationErrors.join("\n")}`);
  }

  let backupPath = null;
  if (apply) {
    const backupDir = path.join(backupRoot, `manual-renumber-virtual-drawings-${stamp}`);
    fs.mkdirSync(backupDir, { recursive: true });
    backupPath = path.join(backupDir, "ai-pdm.sqlite");
    await db.backup(backupPath);
    applyPlan(db, plan);
    applyExternalReferencePlan(db, externalPlan);
  }

  const checkResult = postCheck(db);
  const sample = [...plan.plannedSubmissions.values()].slice(0, 12).map((row) => ({
    submission_id: row.submissionId,
    drawing_number: `${row.oldDrawingNumber} -> ${row.newDrawingNumber}`,
    revision: `${row.oldRevision} -> ${row.newRevision}`,
    part_number: `${row.oldPartNumber} -> ${row.newPartNumber}`,
    part_name: row.newPartName
  }));
  const report = {
    mode: apply ? "apply" : check ? "check" : "dry-run",
    generated_at: now,
    db_path: dbPath,
    backup_path: backupPath,
    source_policy: "2-RD-XXX_工程圖資料及編號管理辦法_V0.3.docx",
    rules: {
      drawing_number: "D-[料件根號]-[用途碼][流水號B], e.g. D-0001-MA1",
      part_number: "P-[流水號A]-[流水號C], e.g. P-0001-001",
      part_name: "自製件非共用件: [核心名詞]_[系列代號]_[特性]_[流水號]",
      revision: "未釋出 V0.x；Released/Obsolete V1, V2；釋出後待審 Vn.x"
    },
    planned: {
      total_submissions: plan.totalSubmissions,
      target_submissions: plan.targetSubmissions,
      target_items: plan.targetItems,
      dangling_reference_parts: externalPlan.byPart.size,
      dangling_reference_drawings: externalPlan.byDrawing.size
    },
    check: checkResult,
    sample
  };
  const reportPath = path.join(reportDir, `virtual-drawing-renumbering-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ reportPath, ...report }, null, 2));

  if (
    check &&
    (checkResult.nonstandard_drawings !== 0 ||
      checkResult.nonstandard_parts !== 0 ||
      checkResult.nonstandard_reference_parts !== 0 ||
      checkResult.nonstandard_reference_drawings !== 0 ||
      checkResult.reference_source_filename_mismatch !== 0)
  ) {
    process.exitCode = 1;
  }
} finally {
  db.close();
}
