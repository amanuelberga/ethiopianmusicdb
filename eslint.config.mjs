import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // .agents/ holds local agent skills (git-ignored), not app code
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".agents/**"]),
]);

export default eslintConfig;
