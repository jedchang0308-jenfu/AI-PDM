import { describe, expect, it } from "vitest";
import {
  checkDraftNumberingDelete,
  draftNumberingDeleteFingerprint,
  type DraftNumberingDeleteActor,
  type DraftNumberingDeleteBasis,
} from "@/lib/draft-numbering-delete-policy";

const actor: DraftNumberingDeleteActor = { userId: "user-rd-1", systemAdmin: false };

function basis(overrides: Partial<DraftNumberingDeleteBasis> = {}): DraftNumberingDeleteBasis {
  return {
    companyId: "company-jenfu",
    root: { id: "root-1", code: "A0062", status: "Draft", responsibleUserIds: ["user-rd-1"] },
    drawings: [{ id: "drawing-1", code: "A0062-M01", status: "Draft", responsibleUserIds: ["user-rd-1"] }],
    parts: [{ id: "part-1", code: "A0062-P01", status: "Draft", responsibleUserIds: ["user-rd-1"] }],
    transfers: [],
    fileIds: ["file-1"],
    controlledReferences: 0,
    ...overrides,
  };
}

describe("draft numbering delete policy", () => {
  it("allows the responsible user to delete a draft bundle and its owned draft transfer reference", () => {
    const transfer = {
      id: "transfer-item-1",
      packageId: "package-1",
      packageCode: "TP-2026-0002",
      packageStatus: "Draft",
      packageOwnerId: actor.userId,
      packageVersion: 3,
      entityCode: "A0062-M01",
    };

    expect(checkDraftNumberingDelete(basis({ transfers: [transfer] }), actor)).toBeNull();
  });

  it("rejects missing or other responsible users, while a system admin bypasses ownership only", () => {
    const otherOwnerBasis = basis({
      parts: [{ id: "part-1", code: "A0062-P01", status: "Draft", responsibleUserIds: ["user-rd-2"] }],
    });
    expect(checkDraftNumberingDelete(otherOwnerBasis, actor)).toBe("NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE");
    expect(checkDraftNumberingDelete(basis({
      drawings: [{ id: "drawing-1", code: "A0062-M01", status: "Draft", responsibleUserIds: [] }],
    }), actor)).toBe("NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE");

    const admin = { userId: "system-admin", systemAdmin: true };
    expect(checkDraftNumberingDelete(otherOwnerBasis, admin)).toBeNull();
    expect(checkDraftNumberingDelete(basis({ controlledReferences: 1 }), admin))
      .toBe("NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES");
    expect(checkDraftNumberingDelete(basis({
      transfers: [{
        id: "transfer-item-1", packageId: "package-1", packageCode: "TP-2026-0002",
        packageStatus: "Released", packageOwnerId: actor.userId, packageVersion: 3, entityCode: "A0062-M01",
      }],
    }), admin)).toBe("NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES");
  });

  it("blocks non-draft members, controlled references, non-draft transfer packages, and another transfer owner", () => {
    expect(checkDraftNumberingDelete(basis({
      drawings: [{ id: "drawing-1", code: "A0062-M01", status: "Released", responsibleUserIds: [actor.userId] }],
    }), actor)).toBe("NUMBERING_BUNDLE_NOT_DRAFT");
    expect(checkDraftNumberingDelete(basis({ controlledReferences: 1 }), actor))
      .toBe("NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES");

    const transfer = {
      id: "transfer-item-1", packageId: "package-1", packageCode: "TP-2026-0002",
      packageStatus: "Draft", packageOwnerId: actor.userId, packageVersion: 3, entityCode: "A0062-M01",
    };
    expect(checkDraftNumberingDelete(basis({ transfers: [{ ...transfer, packageStatus: "Cancelled" }] }), actor))
      .toBe("NUMBERING_DRAFT_DELETE_HAS_CONTROLLED_REFERENCES");
    expect(checkDraftNumberingDelete(basis({ transfers: [{ ...transfer, packageOwnerId: "user-rd-2" }] }), actor))
      .toBe("NUMBERING_DRAFT_DELETE_NOT_RESPONSIBLE");
  });

  it("changes the fingerprint when bundle identity, responsibility, or transfer identity changes", () => {
    const original = basis({
      transfers: [{
        id: "transfer-item-1", packageId: "package-1", packageCode: "TP-2026-0002",
        packageStatus: "Draft", packageOwnerId: actor.userId, packageVersion: 3, entityCode: "A0062-M01",
      }],
    });
    const fingerprint = draftNumberingDeleteFingerprint(original, actor);

    expect(draftNumberingDeleteFingerprint(basis({
      root: { ...original.root, id: "root-other" }, transfers: original.transfers,
    }), actor)).not.toBe(fingerprint);
    expect(draftNumberingDeleteFingerprint(basis({
      root: { ...original.root, responsibleUserIds: ["user-rd-2"] }, transfers: original.transfers,
    }), actor)).not.toBe(fingerprint);
    expect(draftNumberingDeleteFingerprint(basis({
      transfers: [{ ...original.transfers[0], id: "transfer-item-other" }],
    }), actor)).not.toBe(fingerprint);
    expect(draftNumberingDeleteFingerprint(original, { ...actor, userId: "user-rd-2" })).not.toBe(fingerprint);
  });

  it("keeps the fingerprint stable when unordered collections are presented in a different order", () => {
    const first = basis({
      drawings: [
        { id: "drawing-b", code: "A0062-R02", status: "Draft", responsibleUserIds: ["user-rd-2", "user-rd-1"] },
        { id: "drawing-a", code: "A0062-M01", status: "NeedInfo", responsibleUserIds: ["user-rd-1"] },
      ],
      parts: [
        { id: "part-b", code: "A0062-P02", status: "Draft", responsibleUserIds: ["user-rd-2"] },
        { id: "part-a", code: "A0062-P01", status: "Draft", responsibleUserIds: ["user-rd-1"] },
      ],
      transfers: [
        { id: "transfer-b", packageId: "package-b", packageCode: "TP-2", packageStatus: "Draft", packageOwnerId: "user-rd-1", packageVersion: 2, entityCode: "A0062-P02" },
        { id: "transfer-a", packageId: "package-a", packageCode: "TP-1", packageStatus: "Draft", packageOwnerId: "user-rd-1", packageVersion: 1, entityCode: "A0062-M01" },
      ],
      fileIds: ["file-b", "file-a"],
    });
    const reversed = basis({
      drawings: [...first.drawings].reverse().map(member => ({ ...member, responsibleUserIds: [...member.responsibleUserIds].reverse() })),
      parts: [...first.parts].reverse(),
      transfers: [...first.transfers].reverse(),
      fileIds: [...first.fileIds].reverse(),
    });

    expect(draftNumberingDeleteFingerprint(reversed, actor)).toBe(draftNumberingDeleteFingerprint(first, actor));
  });
});
