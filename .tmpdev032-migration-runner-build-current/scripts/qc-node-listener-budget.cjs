"use strict";

const listenerBudget = 64;

for (const stream of [process.stdout, process.stderr]) {
  if (typeof stream?.getMaxListeners === "function" && typeof stream.setMaxListeners === "function") {
    stream.setMaxListeners(Math.max(stream.getMaxListeners(), listenerBudget));
  }
}
