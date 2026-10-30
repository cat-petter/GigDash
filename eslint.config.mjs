import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Not scripts/: seeding works across users on purpose.
    files: ["src/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='db'][property.name=/^(gig|syncRun|savedName|pinnedSpelling|matchRule|calendarAccount)$/]",
          message: "This table belongs to a user. Use forUser(userId) so the query can only reach their rows.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
