import { defineConfig } from 'vitest/config';

// One project per suite named in plan.md > Project Structure, so a targeted
// suite can be run alone and CI can report them separately.
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
    },
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      { test: { name: 'contract', include: ['tests/contract/**/*.test.ts'] } },
      { test: { name: 'integration', include: ['tests/integration/**/*.test.ts'] } },
      { test: { name: 'authorization', include: ['tests/authorization/**/*.test.ts'] } },
      { test: { name: 'field-policy', include: ['tests/field-policy/**/*.test.ts'] } },
      { test: { name: 'security', include: ['tests/security/**/*.test.ts'] } },
    ],
  },
});
