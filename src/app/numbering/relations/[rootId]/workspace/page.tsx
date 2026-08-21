import { RelationWorkspaceEditor } from "@/components/relation-workspace-editor";

export default async function RelationWorkspacePage({ params, searchParams }: { params: Promise<{ rootId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rootId } = await params;
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : null;
  return <RelationWorkspaceEditor rootId={decodeURIComponent(rootId)} intent={value("intent") ?? "view"} returnTo={value("returnTo")} />;
}
