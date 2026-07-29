import nest from '@pasta/config/eslint/nest';

const config = [
  ...nest,
  { ignores: ['dist/**', 'src/generated/**'] },
  {
    // Seeds and CLI scripts report progress on stdout by design.
    files: ['prisma/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
