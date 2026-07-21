import js from "@eslint/js";
import globals from "globals";
import fs from "node:fs";

const screepsGlobals = JSON.parse(fs.readFileSync(new URL("./screeps-globals.json", import.meta.url), "utf8"));

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            "no-var": "warn",
            "prefer-const": "warn",
            eqeqeq: ["warn", "always"],
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "no-console": "off",
            indent: ["warn", 4, { SwitchCase: 1 }],
            quotes: ["warn", "single", { avoidEscape: true }],
            semi: ["warn", "always"],
            "no-trailing-spaces": "warn",
        },
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: screepsGlobals,
        },
    },
    {
        ignores: ["node_modules/**", "eslint.config.mjs", "dist/**", "coverage/**"],
    },
];
