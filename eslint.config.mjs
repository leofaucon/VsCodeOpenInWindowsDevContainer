import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
    {
        ignores: ["out/**", "node_modules/**"],
    },
    eslint.configs.recommended,
    {
        files: ["src/**/*.ts"],
        extends: tseslint.configs.recommendedTypeChecked,
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/explicit-function-return-type": "error",
            "@typescript-eslint/no-floating-promises": "error",
        },
    },
);
