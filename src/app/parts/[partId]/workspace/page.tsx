import { PartWorkspaceEditor } from "@/components/part-workspace-editor";
import { CanonicalChangeWorkspace } from "@/components/canonical-change-workspace";

export default async function PartWorkspacePage({ params, searchParams }: { params: Promise<{ partId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { partId } = await params;
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : null;
  const workId = value("workId");
  if (workId) return <CanonicalChangeWorkspace entityType="part" entityId={decodeURIComponent(partId)} workId={workId} returnTo={value("returnTo")} />;
  return <PartWorkspaceEditor partId={decodeURIComponent(partId)} intent={value("intent") ?? "view"} returnTo={value("returnTo")} />;
}
