import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [".next*/**", ".worktrees/**", ".tmp/**", "tmp/**", "node_modules/**", "data/**", "output/**"]
  },
  // Next's JS pattern includes mts, but its TypeScript parser pattern omits it.
  // Keep the existing parser/rules for module declarations as well.
  ...nextVitals.map(entry => entry.name === "next/typescript"
    ? { ...entry, files: [...entry.files, "**/*.mts"] }
    : entry),
  {
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  }
];

export default config;
