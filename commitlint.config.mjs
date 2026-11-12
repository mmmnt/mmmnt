export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'test', 'refactor', 'chore', 'docs', 'ci']],
    'scope-enum': [
      2,
      'always',
      [
        'core',
        'derive',
        'generate',
        'harness',
        'viz',
        'board',
        'emit-ts',
        'sync',
        'schema',
        'cli',
        'mcp',
        '',
      ],
    ],
    'scope-empty': [0],
  },
};
