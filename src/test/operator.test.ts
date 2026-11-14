// Operator details on the legal pages: shown when filled in, never invented.
import { describe, it, expect } from 'vitest';
import { OPERATOR, contactEmail, governingLawLine, operatorLines, type Operator } from '@/lib/operator';

const empty: Operator = { name: '', country: '', contactEmail: '', governingLaw: '' };

describe('operator details', () => {
  it('ships empty, so nothing about the owner is guessed', () => {
    expect(OPERATOR).toEqual(empty);
  });

  it('shows no line at all while nothing is filled in', () => {
    expect(operatorLines(empty)).toEqual({ lines: [], incomplete: true });
    expect(contactEmail(empty)).toBeNull();
    expect(governingLawLine(empty)).toBeNull();
  });

  it('treats whitespace as empty', () => {
    expect(operatorLines({ ...empty, name: '  ' })).toEqual({ lines: [], incomplete: true });
    expect(contactEmail({ ...empty, contactEmail: ' ' })).toBeNull();
  });

  it('shows the fields that are filled and still says the rest are missing', () => {
    const { lines, incomplete } = operatorLines({ ...empty, name: 'A. Person' });
    expect(lines).toEqual([{ label: 'Run by', value: 'A. Person' }]);
    expect(incomplete).toBe(true);
  });

  it('is complete with name, country and email, and links the email', () => {
    const op = { name: 'A. Person', country: 'Testland', contactEmail: 'help@example.test', governingLaw: '' };
    expect(operatorLines(op)).toEqual({
      lines: [
        { label: 'Run by', value: 'A. Person' },
        { label: 'Based in', value: 'Testland' },
        { label: 'Contact', value: 'help@example.test', href: 'mailto:help@example.test' },
      ],
      incomplete: false,
    });
  });

  it('writes the governing-law sentence only from the governingLaw field', () => {
    expect(governingLawLine({ ...empty, country: 'Testland' })).toBeNull();
    expect(governingLawLine({ ...empty, governingLaw: 'the laws of Testland.' }))
      .toBe('These terms are governed by the laws of Testland.');
  });
});
