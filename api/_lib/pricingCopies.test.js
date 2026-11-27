import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The quote page prices quotes on the server with copies of the browser's
// pricing code. They must not drift apart.
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const body = (text) => text.split('\n').slice(2).join('\n');

describe('pricing copies', () => {
  for (const name of ['priceList', 'quotePricing', 'quoteTerms']) {
    it(`${name}.js matches src/utils`, () => {
      expect(body(read(`./${name}.js`))).toBe(read(`../../src/utils/${name}.js`));
    });
  }
});
