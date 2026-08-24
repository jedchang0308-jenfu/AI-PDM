import { CanonicalNumberingCreateForm } from "@/components/canonical-numbering-create-form";

function safeFrom(value: string | undefined): "drawing" | "part" | "search" {
  return value === "drawing" || value === "part" ? value : "search";
}

function safeReturnTo(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "";
}

export default async function NumberingCreatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (input: string | string[] | undefined) => Array.isArray(input) ? input[0] : input;
  const initialRoot = value(params.root)?.trim() || "";
  return <CanonicalNumberingCreateForm initialFrom={safeFrom(value(params.from))} initialRoot={initialRoot} returnTo={safeReturnTo(value(params.returnTo))} />;
}
