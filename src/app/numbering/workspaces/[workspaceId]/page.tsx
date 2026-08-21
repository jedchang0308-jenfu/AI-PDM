import { NumberingWorkspaceEditor } from "@/components/numbering-workspace-editor";

export default async function NumberingWorkspacePage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspaceId } = await params;
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : null;
  return <NumberingWorkspaceEditor workspaceId={decodeURIComponent(workspaceId)} intent={value("intent") ?? "view"} returnTo={value("returnTo")} />;
}
