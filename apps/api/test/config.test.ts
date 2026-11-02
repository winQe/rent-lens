import { afterEach, describe, expect, it } from 'vitest';
import { intEnv } from '../src/config.ts';

afterEach(() => {
  delete process.env.TEST_INT;
});

describe('intEnv', () => {
  it('uses the default when the variable is not set or empty', () => {
    expect(intEnv('TEST_INT', 5)).toBe(5);
    process.env.TEST_INT = '';
    expect(intEnv('TEST_INT', 5)).toBe(5);
  });

  it('reads a whole number, including 0', () => {
    process.env.TEST_INT = '1';
    expect(intEnv('TEST_INT', 5)).toBe(1);
    process.env.TEST_INT = '0';
    expect(intEnv('TEST_INT', 5)).toBe(0);
  });

  it('refuses a value that is not a whole number of 0 or more, instead of falling back silently', () => {
    for (const bad of ['abc', '-1', '1.5']) {
      process.env.TEST_INT = bad;
      expect(() => intEnv('TEST_INT', 5), bad).toThrow(/whole number/);
    }
  });
});
