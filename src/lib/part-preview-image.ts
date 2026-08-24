import "server-only";

import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";

export const PART_PREVIEW_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PART_PREVIEW_IMAGE_MIN_DIMENSION = 64;
export const PART_PREVIEW_IMAGE_MAX_DIMENSION = 8192;

export type NormalizedPartPreviewImage = {
  bytes: Buffer;
  format: "png" | "jpeg";
  mimeType: "image/png" | "image/jpeg";
  extension: ".png" | ".jpg";
  width: number;
  height: number;
  sha256: string;
};

export type PartPreviewImageValidationCode =
  | "PART_PREVIEW_IMAGE_EMPTY"
  | "PART_PREVIEW_IMAGE_TOO_LARGE"
  | "PART_PREVIEW_IMAGE_TYPE_INVALID"
  | "PART_PREVIEW_IMAGE_MULTI_PAGE"
  | "PART_PREVIEW_IMAGE_DIMENSION_INVALID"
  | "PART_PREVIEW_IMAGE_DECODE_FAILED";

export class PartPreviewImageValidationError extends Error {
  constructor(readonly code: PartPreviewImageValidationCode, message: string) {
    super(message);
    this.name = "PartPreviewImageValidationError";
  }
}

type AcceptedImageType = {
  format: "png" | "jpeg";
  mimeType: "image/png" | "image/jpeg";
  extension: ".png" | ".jpg";
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

function inputType(input: { bytes: Buffer; fileName: string; declaredMimeType: string }): AcceptedImageType {
  const extension = path.extname(input.fileName).toLowerCase();
  const declaredMimeType = input.declaredMimeType.trim().toLowerCase();
  const isPng = extension === ".png"
    && declaredMimeType === "image/png"
    && input.bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const isJpeg = [".jpg", ".jpeg"].includes(extension)
    && declaredMimeType === "image/jpeg"
    && input.bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE);

  if (isPng) return { format: "png", mimeType: "image/png", extension: ".png" };
  if (isJpeg) return { format: "jpeg", mimeType: "image/jpeg", extension: ".jpg" };
  throw new PartPreviewImageValidationError(
    "PART_PREVIEW_IMAGE_TYPE_INVALID",
    "預覽圖只接受副檔名、MIME 與內容一致的 PNG 或 JPEG"
  );
}

function assertByteSize(bytes: Buffer) {
  if (bytes.byteLength < 1) {
    throw new PartPreviewImageValidationError("PART_PREVIEW_IMAGE_EMPTY", "預覽圖不可為空檔");
  }
  if (bytes.byteLength > PART_PREVIEW_IMAGE_MAX_BYTES) {
    throw new PartPreviewImageValidationError("PART_PREVIEW_IMAGE_TOO_LARGE", "預覽圖不可超過 10 MiB");
  }
}

function assertDimensions(width: number | undefined, height: number | undefined) {
  if (!width || !height
    || width < PART_PREVIEW_IMAGE_MIN_DIMENSION
    || height < PART_PREVIEW_IMAGE_MIN_DIMENSION
    || width > PART_PREVIEW_IMAGE_MAX_DIMENSION
    || height > PART_PREVIEW_IMAGE_MAX_DIMENSION) {
    throw new PartPreviewImageValidationError(
      "PART_PREVIEW_IMAGE_DIMENSION_INVALID",
      "預覽圖寬高各須介於 64 與 8192 像素"
    );
  }
}

function hasAnimatedPngControl(bytes: Buffer) {
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return false;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL") return true;
    if (type === "IEND") return false;
    offset = chunkEnd;
  }
  return false;
}

export async function normalizePartPreviewImage(input: {
  bytes: Buffer;
  fileName: string;
  declaredMimeType: string;
}): Promise<NormalizedPartPreviewImage> {
  assertByteSize(input.bytes);
  const accepted = inputType(input);
  if (accepted.format === "png" && hasAnimatedPngControl(input.bytes)) {
    throw new PartPreviewImageValidationError(
      "PART_PREVIEW_IMAGE_MULTI_PAGE",
      "預覽圖只接受單頁 PNG 或 JPEG"
    );
  }

  try {
    const metadata = await sharp(input.bytes, {
      limitInputPixels: PART_PREVIEW_IMAGE_MAX_DIMENSION * PART_PREVIEW_IMAGE_MAX_DIMENSION,
      failOn: "warning",
      pages: -1
    }).metadata();

    if (metadata.format !== accepted.format) {
      throw new PartPreviewImageValidationError(
        "PART_PREVIEW_IMAGE_TYPE_INVALID",
        "預覽圖的解碼格式與檔案宣告不一致"
      );
    }
    if ((metadata.pages ?? 1) !== 1) {
      throw new PartPreviewImageValidationError(
        "PART_PREVIEW_IMAGE_MULTI_PAGE",
        "預覽圖只接受單頁 PNG 或 JPEG"
      );
    }
    assertDimensions(metadata.width, metadata.height);

    let pipeline = sharp(input.bytes, {
      limitInputPixels: PART_PREVIEW_IMAGE_MAX_DIMENSION * PART_PREVIEW_IMAGE_MAX_DIMENSION,
      failOn: "warning"
    }).autoOrient().toColourspace("srgb");
    pipeline = accepted.format === "png"
      ? pipeline.png({ compressionLevel: 9 })
      : pipeline.jpeg({ quality: 90 });

    const normalized = await pipeline.toBuffer({ resolveWithObject: true });
    assertByteSize(normalized.data);
    assertDimensions(normalized.info.width, normalized.info.height);

    return {
      bytes: normalized.data,
      format: accepted.format,
      mimeType: accepted.mimeType,
      extension: accepted.extension,
      width: normalized.info.width,
      height: normalized.info.height,
      sha256: crypto.createHash("sha256").update(normalized.data).digest("hex")
    };
  } catch (error) {
    if (error instanceof PartPreviewImageValidationError) throw error;
    throw new PartPreviewImageValidationError(
      "PART_PREVIEW_IMAGE_DECODE_FAILED",
      "預覽圖無法安全解碼"
    );
  }
}
