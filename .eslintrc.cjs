/**
 * Codacy-only ESLint config (local lint uses oxlint on ./src).
 * Declares AngularJS browser globals so html/js does not need per-file eslint-disable.
 */
module.exports = {
  root: true,
  ignorePatterns: ['build/**', 'dist/**', 'coverage/**', 'node_modules/**', 'html/js/libs/**'],
  overrides: [
    {
      files: ['html/js/**/*.js'],
      env: {
        browser: true,
        es2020: true,
      },
      globals: {
        angular: 'readonly',
      },
      rules: {
        // Angular controllers use `var self = this` extensively.
        'no-invalid-this': 'off',
      },
    },
    {
      files: ['src/utils/safe-fs.ts'],
      rules: {
        // Syntactic rule: flags any non-literal fs path even after containment checks.
        'security/detect-non-literal-fs-filename': 'off',
      },
    },
  ],
};
