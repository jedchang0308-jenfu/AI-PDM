export type SubmissionInput = {
  drawingNumber: string;
  partNumber: string;
  partName: string;
  revision: string;
  material: string;
  surfaceFinish: string;
  documentType: string;
  changeDescription: string;
  submittedBy: string;
};

const weakDescriptions = new Set(["change", "update", "modify", "fix"]);
const allowedFileExtensions = new Set(["sldprt", "sldasm", "slddrw", "pdf", "dwg"]);

export function validateSubmissionInput(input: SubmissionInput) {
  const errors: string[] = [];

  const required: Array<[keyof SubmissionInput, string]> = [
    ["drawingNumber", "圖號"],
    ["partNumber", "料號"],
    ["partName", "品名"],
    ["revision", "版次"],
    ["material", "材質"],
    ["surfaceFinish", "表面處理"],
    ["documentType", "文件類型"],
    ["submittedBy", "送審者"]
  ];

  for (const [key, label] of required) {
    if (!input[key]?.trim()) {
      errors.push(`${label}為必填`);
    }
  }

  const desc = input.changeDescription.trim();
  if (desc.length < 5 || desc.length > 100) {
    errors.push("變更原因需為 5 到 100 個字");
  }
  if (/^\d+$/.test(desc)) {
    errors.push("變更原因不可只有數字");
  }
  if (weakDescriptions.has(desc.toLowerCase())) {
    errors.push("變更原因過於籠統");
  }
  if (!/[A-Za-z\u4e00-\u9fff]/.test(desc)) {
    errors.push("變更原因需包含文字");
  }

  return errors;
}

export function normalizeFileRole(filename: string) {
  const ext = getFileExtension(filename);
  if (ext && allowedFileExtensions.has(ext)) {
    return ext;
  }
  return "other";
}

export function validateUploadedFiles(files: File[], maxFileBytes: number) {
  const errors: string[] = [];

  for (const file of files) {
    const ext = getFileExtension(file.name);
    if (!ext || !allowedFileExtensions.has(ext)) {
      errors.push(`不支援的檔案類型：${file.name}`);
    }
    if (file.size <= 0) {
      errors.push(`檔案為空：${file.name}`);
    }
    if (file.size > maxFileBytes) {
      errors.push(`檔案超過 ${formatBytes(maxFileBytes)} 限制：${file.name}`);
    }
  }

  return errors;
}

function getFileExtension(filename: string) {
  const normalized = filename.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index > 0 && index < normalized.length - 1 ? normalized.slice(index + 1) : "";
}

function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}
