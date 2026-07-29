import next from '@pasta/config/eslint/next';

const config = [...next, { ignores: ['.next/**', 'next-env.d.ts'] }];

export default config;
