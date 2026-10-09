/**
 * Codacy may load this when ESLint analysis uses a local config.
 * `detect-non-literal-fs-filename` flags every non-literal fs path (even after
 * normalize/startsWith). Real containment is enforced in src/utils/safe-path.ts
 * and src/utils/safe-fs.ts.
 */
module.exports = {
  root: true,
  ignorePatterns: ['build/**', 'dist/**', 'coverage/**', 'node_modules/**', 'html/js/libs/**'],
  overrides: [
    {
      files: ['src/utils/safe-fs.ts'],
      rules: {
        'security/detect-non-literal-fs-filename': 'off',
      },
    },
  ],
};
