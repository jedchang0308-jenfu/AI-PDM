import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>
}));

vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], (next: unknown) => {
        hooks.slots[index] = typeof next === "function"
          ? (next as (current: unknown) => unknown)(hooks.slots[index])
          : next;
      }];
    },
    useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); }
  };
});

import { CanonicalNumberingCreateAction } from "./canonical-numbering-create-action";

const reply = (status: number, body: object) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" }
});

function render() {
  hooks.cursor = 0;
  hooks.effects = [];
  return CanonicalNumberingCreateAction({ surface: "drawing" });
}

function text(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return text(node.props.children);
  return "";
}

function find(node: unknown, predicate: (props: Record<string, unknown>) => boolean): unknown {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map((item) => find(item, predicate)).find(Boolean) ?? null;
  const candidate = node as { props?: Record<string, unknown> };
  if (candidate.props && predicate(candidate.props)) return node;
  return find(candidate.props?.children, predicate);
}

async function load(fetcher: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetcher);
  render();
  const effects = [...hooks.effects];
  for (const effect of effects) effect();
  await vi.waitFor(() => expect(text(render())).not.toContain("確認權限中"));
  return render();
}

beforeEach(() => { hooks.slots = []; hooks.cursor = 0; hooks.effects = []; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("CanonicalNumberingCreateAction permission projection", () => {
  it("shows the create action only when the shared permission endpoint allows it", async () => {
    const tree = await load(vi.fn(async () => reply(200, { actions: { "numbering.create": true } })));
    expect(find(tree, (props) => props["data-canonical-numbering-create"] === "true")).toBeTruthy();
    expect(text(tree)).toContain("建立編號");
  });

  it("fails closed with an explicit denial when the shared permission endpoint denies it", async () => {
    const tree = await load(vi.fn(async () => reply(200, { actions: { "numbering.create": false } })));
    expect(find(tree, (props) => props["data-canonical-numbering-create"] === "true")).toBeNull();
    expect(find(tree, (props) => props["data-canonical-numbering-create-denied"] === "true")).toBeTruthy();
    expect(text(tree)).toContain("目前角色沒有建立編號權限");
  });

  it("fails closed when the permission dependency is unavailable", async () => {
    const tree = await load(vi.fn(async () => reply(503, { code: "principal_authorization_unavailable" })));
    expect(find(tree, (props) => props["data-canonical-numbering-create"] === "true")).toBeNull();
    expect(text(tree)).toContain("目前角色沒有建立編號權限");
  });
});
