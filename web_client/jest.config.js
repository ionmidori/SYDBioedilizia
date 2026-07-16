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
    // Ratchet floors, NOT the aspirational goal. Actual coverage is ~20% today;
    // these are set just below current so CI enforces "no regression" while the
    // suite grows. Raise them as coverage improves — target remains 70%.
    coverageThreshold: {
        global: {
            branches: 11,
            functions: 14,
            lines: 18,
            statements: 18,
        },
    },
    transformIgnorePatterns: [
        '/node_modules/(?!(@ai-core|lucide-react|@radix-ui|framer-motion)/)',
    ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
