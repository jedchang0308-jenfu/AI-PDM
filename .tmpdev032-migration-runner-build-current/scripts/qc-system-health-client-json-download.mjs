#!/usr/bin/env node

import assert from "node:assert/strict";
import { downloadJsonFile } from "../src/lib/client-json-download.ts";

const originalDocument = globalThis.document;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const calls = [];
let capturedBlob;

const anchor = {
  href: "",
  download: "",
  click() { calls.push("click"); },
  remove() { calls.push("remove"); }
};

try {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tag) {
        assert.equal(tag, "a");
        calls.push("create");
        return anchor;
      },
      body: {
        appendChild(value) {
          assert.equal(value, anchor);
          calls.push("append");
        }
      }
    }
  });
  URL.createObjectURL = (blob) => {
    capturedBlob = blob;
    calls.push("create-url");
    return "blob:system-health-json";
  };
  URL.revokeObjectURL = (url) => calls.push(`revoke:${url}`);

  downloadJsonFile({ z: 1, a: 2 }, "system-health.json");

  assert.equal(anchor.href, "blob:system-health-json");
  assert.equal(anchor.download, "system-health.json");
  assert.deepEqual(calls, ["create-url", "create", "append", "click", "remove", "revoke:blob:system-health-json"]);
  assert(capturedBlob instanceof Blob);
  assert.equal(capturedBlob.type, "application/json;charset=utf-8");
  assert.equal(await capturedBlob.text(), '{\n  "z": 1,\n  "a": 2\n}');
} finally {
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
  if (originalDocument === undefined) delete globalThis.document;
  else Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
}

console.log("QC System Health client JSON download: PASS (blob, filename, click, cleanup, revoke)");
