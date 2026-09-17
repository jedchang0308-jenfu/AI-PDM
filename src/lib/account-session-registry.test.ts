import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("account session registry database boundary", () => {
  it("qualifies the legacy public table for Cloud SQL search paths", () => {
    const source = readFileSync(new URL("./account-session-registry.ts", import.meta.url), "utf8");

    expect(source).toContain("INSERT INTO public.account_session_records");
    expect(source).toContain("UPDATE public.account_session_records");
    expect(source).toContain("FROM public.account_session_records");
    expect(source).not.toMatch(/(?:INSERT INTO|UPDATE|FROM)\s+account_session_records\b/);
  });
});
