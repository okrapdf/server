import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errors.js';

describe('getErrorMessage', () => {
  it('returns the message from Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(getErrorMessage('plain failure')).toBe('plain failure');
    expect(getErrorMessage(404)).toBe('404');
  });
});
