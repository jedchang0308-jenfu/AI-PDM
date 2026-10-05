import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Presentation fixture only: render the actual component with a completed
// settings GET. Effects/commands/providers are not executed by server rendering.
const fixture = vi.hoisted(() => ({ limited: true, secretCapability: true, secretReadState: "ready" }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => actual.useState(
    initial && typeof initial === "object" && "status" in initial && initial.status === "loading"
      ? { status: "ready", settings: { productionSliceSettingsLimited: fixture.limited, secretManagementAvailable: fixture.secretCapability } }
      : initial === "pending" ? fixture.secretReadState : initial) };
});
import { SettingsScreen } from "@/components/settings-screen";

describe("DEV122 actual settings presentation respects the server slice status", () => {
  beforeEach(() => {
    fixture.limited = true;
    fixture.secretCapability = true;
    fixture.secretReadState = "ready";
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it.each([
    [false, "ready"], [true, "pending"], [true, "failed"]
  ])("offers no key input while capability=%s/read=%s", (capability, readState) => {
    fixture.secretCapability = capability;
    fixture.secretReadState = readState;
    const html = renderToStaticMarkup(<SettingsScreen initialArea="security" />);
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('type="submit"');
    expect(html).toContain("安全設定");
  });
  it("offers the actual password form only with both capabilities and a successful secrets read", () => {
    fixture.secretCapability = true;
    fixture.secretReadState = "ready";
    const html = renderToStaticMarkup(<SettingsScreen initialArea="security" />);
    expect(html).toContain('type="password"');
    expect(html).toContain("儲存並啟用");
    expect(html).not.toContain("測試最新版本");
    expect(html).not.toContain("啟用已測試版本");
  });
  it("offers overview/security/read-only workflow and no actionable integration CTA in the slice", () => {
    fixture.limited = true;
    const html = renderToStaticMarkup(<SettingsScreen initialArea="overview" />);
    expect(html).toContain('href="/settings"');
    expect(html).toContain('href="/settings/security"');
    expect(html).toContain('href="/settings/workflow"');
    for (const area of ["integrations", "system"]) expect(html).not.toContain(`href="/settings/${area}"`);
    expect(html).toContain("整合設定尚未開放");
    expect(html).not.toContain("管理整合設定");
  });
  it("mounts the actual read-only role-capability reader on the admitted workflow page", () => {
    fixture.limited = true;
    const html = renderToStaticMarkup(<SettingsScreen initialArea="workflow" />);
    expect(html).toContain('id="settings-workflow"');
    expect(html).toContain('data-testid="role-capability-loading"');
    expect(html).not.toContain('id="settings-integrations"');
    expect(html).not.toContain('id="settings-system"');
  });
  it("does not render an unopened panel from an area selection in the slice", () => {
    fixture.limited = true;
    const html = renderToStaticMarkup(<SettingsScreen initialArea="integrations" />);
    expect(html).toContain("目前位於「總覽」");
    expect(html).not.toContain('id="settings-integrations"');
  });
  it("keeps existing full local settings navigation when the server slice is not configured", () => {
    fixture.limited = false;
    const html = renderToStaticMarkup(<SettingsScreen initialArea="overview" />);
    for (const area of ["integrations", "workflow", "system"]) expect(html).toContain(`href="/settings/${area}"`);
    expect(html).toContain("管理整合設定");
  });
});
