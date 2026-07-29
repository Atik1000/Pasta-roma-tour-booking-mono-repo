import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library only auto-registers cleanup when Vitest globals are enabled.
 * Globals are off here, so unmounting between tests is wired up by hand —
 * without it, queries match elements left behind by earlier renders.
 */
afterEach(() => {
  cleanup();
});
