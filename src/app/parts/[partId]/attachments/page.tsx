import { CanonicalPartAttachmentManager } from "@/components/canonical-part-attachment-manager";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.startsWith("/parts")) return "/parts";
  return value;
}

export default async function PartAttachmentsPage({ params, searchParams }: {
  params: Promise<{ partId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ partId }, query] = await Promise.all([params, searchParams]);
  return <CanonicalPartAttachmentManager partNumber={decodeURIComponent(partId)} returnTo={safeReturnTo(query.returnTo)} />;
}
