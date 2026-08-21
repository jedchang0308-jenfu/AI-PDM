export type PdmEditScopeActor = {
  role?: string | null;
  roles?: readonly string[] | null;
};

const PDM_NON_OWNER_EDIT_ROLES = new Set([
  "Engineer",
  "engineer",
  "rd",
  "R&D Manager",
  "Admin",
  "rd_manager",
  "pdm_admin",
  "system_admin"
]);

export function hasPdmNonOwnerEditScope(actor: PdmEditScopeActor) {
  const roles = [actor.role, ...(actor.roles ?? [])]
    .map((role) => String(role ?? "").trim())
    .filter(Boolean);
  return roles.some((role) => PDM_NON_OWNER_EDIT_ROLES.has(role));
}

export function canEditPdmOwnedResource(input: {
  actorId: string;
  ownerId: string | null | undefined;
  canEditNonOwned: boolean;
}) {
  return !input.ownerId || input.ownerId === input.actorId || input.canEditNonOwned;
}

export function canEditPdmOwnedResourceInCompany(input: {
  actorId: string;
  actorCompanyId: string;
  ownerId: string | null | undefined;
  resourceCompanyId: string;
  actor: PdmEditScopeActor;
}) {
  return input.actorCompanyId === input.resourceCompanyId && canEditPdmOwnedResource({
    actorId: input.actorId,
    ownerId: input.ownerId,
    canEditNonOwned: hasPdmNonOwnerEditScope(input.actor)
  });
}
