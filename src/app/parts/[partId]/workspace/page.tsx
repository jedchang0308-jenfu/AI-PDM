import { PartWorkspaceEditor } from "@/components/part-workspace-editor";

export default async function PartWorkspacePage({ params, searchParams }: { params: Promise<{ partId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { partId } = await params;
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : null;
  return <PartWorkspaceEditor partId={decodeURIComponent(partId)} intent={value("intent") ?? "view"} returnTo={value("returnTo")} />;
}
