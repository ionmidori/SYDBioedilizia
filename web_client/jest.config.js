/* eslint-disable @typescript-eslint/no-require-imports */
const nextJest = require('next/jest');

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testEnvironment: 'jest-environment-jsdom',
    // Use V8's native coverage instead of Istanbul (babel-plugin-istanbul).
    // babel-plugin-istanbul is the only package in the coverage path that
    // require()s test-exclude; the repo pins minimatch to v10 (object export)
    // globally, which breaks test-exclude@6's call to minimatch() as a function
    // ("minimatch is not a function") under --coverage on the CI runner. The v8
    // provider never loads babel-plugin-istanbul, so it sidesteps that clash.
    coverageProvider: 'v8',
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@ai-core$': '<rootDir>/../ai_core/src/index.ts',
    },
    testMatch: [
        '**/__tests__/**/*.[jt]s?(x)',
        '**/?(*.)+(spec|test).[jt]s?(x)',
    ],
    // Playwright specs live in e2e/ and are run by Playwright, not Jest.
    // Separator-agnostic regexes so the exclusion also matches on Windows
    // (backslash paths), not only on the Linux CI runner.
    testPathIgnorePatterns: [
        '[/\\\\]node_modules[/\\\\]',
        '[/\\\\]\\.next[/\\\\]',
        '[/\\\\]e2e[/\\\\]',
    ],
    collectCoverageFrom: [
        'hooks/**/*.{js,jsx,ts,tsx}',
        'components/**/*.{js,jsx,ts,tsx}',
        'lib/**/*.{js,jsx,ts,tsx}',
        '!**/*.d.ts',
        '!**/node_modules/**',
        '!**/.next/**',
    ],
    // Ratchet floors, NOT the aspirational goal. Set just below the measured
    // figure so CI enforces "no regression" while the suite grows; raise them
    // whenever coverage improves — target remains 70%.
    // Measured 2026-07-20 after the lib/validation + cookie-manager +
    // media-utils increment: 23.64 stmts / 61.48 branches / 29.03 funcs.
    coverageThreshold: {
        global: {
            branches: 58,
            functions: 27,
            lines: 22,
            statements: 22,
        },
    },
    transformIgnorePatterns: [
        '/node_modules/(?!(@ai-core|lucide-react|@radix-ui|framer-motion)/)',
    ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
