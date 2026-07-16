import crypto from "node:crypto";

export interface GcsObjectPointer {
  provider: "google_cloud_storage";
  projectId: string;
  bucket: string;
  key: string;
  generation: string;
  metageneration: string;
  bytes: number;
  sha256: string;
  contentType: string;
}

export interface GcsUploadIntent {
  id: string;
  companyId: string;
  actorId: string;
  bucket: string;
  key: string;
  expectedBytes: number;
  expectedSha256: string;
  contentType: string;
  status: "pending" | "uploaded" | "finalized" | "quarantined";
}

export interface DirectGcsStoragePort {
  createUploadIntent(input: Omit<GcsUploadIntent, "id" | "status">): Promise<GcsUploadIntent>;
  finalizeUpload(intentId: string): Promise<GcsObjectPointer>;
  quarantineObject(pointer: GcsObjectPointer, reasonCode: string): Promise<void>;
  createExport(input: { companyId: string; actorId: string; objects: GcsObjectPointer[] }): Promise<{ exportId: string; manifestSha256: string }>;
}

function hash(bytes: Buffer | string) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function normalizedKey(key: string) {
  const value = key.replaceAll("\\", "/").split("/").filter(Boolean).join("/");
  if (!value || value.includes("../")) throw new Error("GCS_OBJECT_KEY_INVALID");
  return value;
}

export class DisabledDirectGcsStoragePort implements DirectGcsStoragePort {
  async createUploadIntent(): Promise<GcsUploadIntent> { return this.unavailable("createUploadIntent"); }
  async finalizeUpload(): Promise<GcsObjectPointer> { return this.unavailable("finalizeUpload"); }
  async quarantineObject(): Promise<void> { return this.unavailable("quarantineObject"); }
  async createExport(): Promise<{ exportId: string; manifestSha256: string }> { return this.unavailable("createExport"); }

  private unavailable(operation: string): never {
    throw new Error(`GCS_LIVE_ADAPTER_NOT_AVAILABLE_PHASE_1:${operation}`);
  }
}

export class FakeDirectGcsStoragePort implements DirectGcsStoragePort {
  readonly intents = new Map<string, GcsUploadIntent>();
  readonly objects = new Map<string, { bytes: Buffer; generation: string; metageneration: string; quarantined: boolean }>();
  readonly quarantineEvents: Array<{ pointer: GcsObjectPointer; reasonCode: string }> = [];
  private generation = 0;

  async createUploadIntent(input: Omit<GcsUploadIntent, "id" | "status">) {
    if (!/^[a-f0-9]{64}$/u.test(input.expectedSha256) || input.expectedBytes < 0) throw new Error("GCS_UPLOAD_EXPECTATION_INVALID");
    const intent: GcsUploadIntent = {
      ...input,
      key: normalizedKey(input.key),
      id: crypto.randomUUID(),
      status: "pending"
    };
    this.intents.set(intent.id, intent);
    return intent;
  }

  uploadFixture(intentId: string, bytes: Buffer) {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status !== "pending") throw new Error("GCS_UPLOAD_INTENT_NOT_PENDING");
    this.generation += 1;
    this.objects.set(`${intent.bucket}/${intent.key}`, {
      bytes,
      generation: String(this.generation),
      metageneration: "1",
      quarantined: false
    });
    intent.status = "uploaded";
  }

  async finalizeUpload(intentId: string) {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status !== "uploaded") throw new Error("GCS_UPLOAD_NOT_READY_TO_FINALIZE");
    const object = this.objects.get(`${intent.bucket}/${intent.key}`);
    if (!object) throw new Error("GCS_UPLOADED_OBJECT_MISSING");
    const pointer: GcsObjectPointer = {
      provider: "google_cloud_storage",
      projectId: "fake-project",
      bucket: intent.bucket,
      key: intent.key,
      generation: object.generation,
      metageneration: object.metageneration,
      bytes: object.bytes.byteLength,
      sha256: hash(object.bytes),
      contentType: intent.contentType
    };
    if (pointer.bytes !== intent.expectedBytes || pointer.sha256 !== intent.expectedSha256) {
      await this.quarantineObject(pointer, "HASH_OR_SIZE_MISMATCH");
      intent.status = "quarantined";
      throw new Error("GCS_FINALIZE_INTEGRITY_MISMATCH");
    }
    intent.status = "finalized";
    return pointer;
  }

  async quarantineObject(pointer: GcsObjectPointer, reasonCode: string) {
    const object = this.objects.get(`${pointer.bucket}/${pointer.key}`);
    if (object) object.quarantined = true;
    this.quarantineEvents.push({ pointer, reasonCode });
  }

  async createExport(input: { companyId: string; actorId: string; objects: GcsObjectPointer[] }) {
    for (const pointer of input.objects) {
      const object = this.objects.get(`${pointer.bucket}/${pointer.key}`);
      if (!object || object.quarantined || object.generation !== pointer.generation) throw new Error("GCS_EXPORT_OBJECT_NOT_FINALIZED");
    }
    const manifest = input.objects
      .map((pointer) => `${pointer.bucket}/${pointer.key}#${pointer.generation}:${pointer.sha256}`)
      .sort()
      .join("\n");
    return { exportId: crypto.randomUUID(), manifestSha256: hash(`${input.companyId}\n${input.actorId}\n${manifest}`) };
  }
}

export function sha256ForGcsFixture(bytes: Buffer) {
  return hash(bytes);
}
