const disallowedProcessWarningPatterns = [
  /MaxListenersExceededWarning/,
  /Possible EventEmitter memory leak/
];

export const qcListenerBudgetPreload = "./scripts/qc-node-listener-budget.cjs";

export function appendNodeOptions(value, option) {
  return [value, option].filter(Boolean).join(" ");
}

export function assertNoDisallowedProcessWarnings(record, name, output) {
  const passed = !disallowedProcessWarningPatterns.some((pattern) => pattern.test(output));
  record(`${name} warning scan`, passed, passed ? "no disallowed process warnings" : "disallowed process warning found");
  if (!passed) {
    throw new Error(`${name} emitted a disallowed process warning`);
  }
}
