/**
 * Jest Configuration for OtaClaw
 *
 * Supports ES modules and jsdom environment for browser testing
 */

export default {
  // Use jsdom for browser-like environment
  testEnvironment: 'jsdom',

  // Support ES modules (removed extensionsToTreatAsEsm as it's inferred from package.json type: module)
  transform: {},

  // Module name mapping for imports
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Test file patterns
  testMatch: [
    '**/src/js/core/__tests__/**/*.test.js',
    '**/src/js/**/__tests__/**/*.test.js',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/js/core/**/*.js',
    '!src/js/core/__tests__/**',
    '!src/js/core/index.js',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Setup files
  setupFilesAfterEnv: [],

  // Mock static assets
  moduleFileExtensions: ['js', 'json'],

  // Verbose output for debugging
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Fail on console errors during tests
  errorOnDeprecated: true,
};
