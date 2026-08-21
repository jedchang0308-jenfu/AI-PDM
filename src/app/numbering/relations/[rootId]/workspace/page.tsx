import { RelationWorkspaceEditor } from "@/components/relation-workspace-editor";
import { CanonicalChangeWorkspace } from "@/components/canonical-change-workspace";

export default async function RelationWorkspacePage({ params, searchParams }: { params: Promise<{ rootId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rootId } = await params;
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : null;
  const workId = value("workId");
  if (workId) return <CanonicalChangeWorkspace entityType="relation" entityId={decodeURIComponent(rootId)} workId={workId} returnTo={value("returnTo")} />;
  return <RelationWorkspaceEditor rootId={decodeURIComponent(rootId)} intent={value("intent") ?? "view"} returnTo={value("returnTo")} />;
}
