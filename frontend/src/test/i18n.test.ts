import { afterEach, describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import si from '@/i18n/si.json';
import ta from '@/i18n/ta.json';
import { getLocale, setLocale, t, tn } from '@/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const catalogs = { si: si as Record<string, string>, ta: ta as Record<string, string> };

afterEach(() => setLocale('en'));

describe('message catalogs', () => {
  for (const [lang, cat] of Object.entries(catalogs)) {
    it(`${lang} has every English key, and no extra ones`, () => {
      const missing = Object.keys(en).filter((k) => !cat[k]?.trim());
      const extra = Object.keys(cat).filter((k) => !(k in en));
      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    });

    it(`${lang} keeps every {placeholder}`, () => {
      const wrong = Object.keys(en).filter((k) => JSON.stringify(placeholders(cat[k] ?? '')) !== JSON.stringify(placeholders(k)));
      expect(wrong).toEqual([]);
    });
  }

  it('Sinhala and Tamil messages are written in their scripts (not English copies)', () => {
    const si_ = Object.values(catalogs.si).filter((v) => /[඀-෿]/.test(v)).length / Object.keys(en).length;
    const ta_ = Object.values(catalogs.ta).filter((v) => /[஀-௿]/.test(v)).length / Object.keys(en).length;
    expect(si_).toBeGreaterThan(0.9);
    expect(ta_).toBeGreaterThan(0.9);
  });

  it('keeps product names in Latin script', () => {
    for (const cat of Object.values(catalogs)) {
      for (const [k, v] of Object.entries(cat)) {
        for (const term of ['FrameFlow', 'LUT', 'Lottie']) if (k.includes(term)) expect(v, k).toContain(term);
      }
    }
  });
});

describe('t()', () => {
  it('fills placeholders, pluralises and switches language', () => {
    expect(t('{n} of {limit} devices used', { n: 2, limit: 3 })).toBe('2 of 3 devices used');
    expect(tn('{n} asset', '{n} assets', 1)).toBe('1 asset');
    expect(tn('{n} asset', '{n} assets', 25)).toBe('25 assets');
    setLocale('si');
    expect(getLocale()).toBe('si');
    expect(document.documentElement.lang).toBe('si');
    expect(localStorage.getItem('fflib.lang')).toBe('si');
    expect(t('Library')).toBe(si['Library' as keyof typeof si]);
    setLocale('ta');
    expect(t('Sign in')).toBe(ta['Sign in' as keyof typeof ta]);
  });
});
