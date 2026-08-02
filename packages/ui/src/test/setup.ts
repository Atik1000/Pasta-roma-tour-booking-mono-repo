import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Testing Library only auto-registers cleanup when Vitest globals are enabled.
 * Globals are off here (explicit imports keep the tests self-describing), so
 * unmounting between tests is wired up by hand — without it, queries match
 * elements left behind by earlier renders.
 */
afterEach(() => {
  cleanup();
});

/**
 * jsdom implements no layout, so it ships no `scrollIntoView`. Components that
 * keep a highlighted row in view call it on every keystroke and would throw
 * here for a reason that says nothing about their behaviour.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
