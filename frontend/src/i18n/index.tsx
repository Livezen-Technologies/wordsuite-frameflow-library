/**
 * Small typed i18n layer: English, Sinhala and Tamil.
 *
 * Messages live in `src/i18n/{en,si,ta}.json`, keyed by the English source text (gettext style), so a call reads
 * `t('Save changes')` and an unknown key is a type error. `{name}` placeholders are filled from `vars`.
 * `npm run i18n` (scripts/i18n-extract.mjs) rebuilds en.json from the source and lists keys missing in si/ta.
 *
 * Changing the language re-mounts the tree under <I18nProvider> (cached queries survive), so plain `t()` calls in
 * helpers outside React components stay correct without every component subscribing.
 */
import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from 'react';
import en from './en.json';
import si from './si.json';
import ta from './ta.json';

export type MessageKey = keyof typeof en;
export type Locale = 'en' | 'si' | 'ta';
type Vars = Record<string, string | number>;

export const LOCALES: { code: Locale; name: string; english: string; bcp47: string }[] = [
  { code: 'en', name: 'English', english: 'English', bcp47: 'en-LK' },
  { code: 'si', name: 'සිංහල', english: 'Sinhala', bcp47: 'si-LK' },
  { code: 'ta', name: 'தமிழ்', english: 'Tamil', bcp47: 'ta-LK' },
];

const catalogs: Record<Locale, Record<string, string>> = { en, si, ta };
const STORAGE_KEY = 'fflib.lang';
const isLocale = (v: unknown): v is Locale => v === 'en' || v === 'si' || v === 'ta';

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : '';
  return isLocale(nav) ? nav : 'en';
}

let current: Locale = detect();
const listeners = new Set<(l: Locale) => void>();

function applyDocument(l: Locale) {
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}
applyDocument(current);

export const getLocale = (): Locale => current;
/** BCP 47 tag for Intl (dates, numbers). */
export const intlLocale = (): string => LOCALES.find((l) => l.code === current)!.bcp47;

export function setLocale(l: Locale): void {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* not persisted */
  }
  applyDocument(l);
  listeners.forEach((fn) => fn(l));
}

function fill(msg: string, vars?: Vars): string {
  if (!vars) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? (typeof vars[k] === 'number' ? (vars[k] as number).toLocaleString(intlLocale()) : String(vars[k])) : m));
}

/** Translate a known message. */
export function t(key: MessageKey, vars?: Vars): string {
  return fill(catalogs[current][key] || en[key] || key, vars);
}

/** Plural pair: `tn('{n} asset', '{n} assets', n)`. */
export function tn(one: MessageKey, other: MessageKey, n: number, vars?: Vars): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

/** Translate a value that may or may not be a message (API enums, type names); falls back to the value itself. */
export function tx(value: string | null | undefined, vars?: Vars): string {
  const s = String(value ?? '');
  return fill(catalogs[current][s] || s, vars);
}

/** Marks a string as a message key without translating it (for maps defined at module level). */
export const msg = (key: MessageKey): MessageKey => key;

/** Translate with React nodes for `{placeholders}`: e.g. a key 'Local token: {token}' with `{ token: <code>dev-admin</code> }`. */
export function tr(key: MessageKey, nodes: Record<string, ReactNode>): ReactNode {
  const text = catalogs[current][key] || en[key] || key;
  const parts = text.split(/(\{\w+\})/g);
  return parts.map((p, i) => {
    const m = /^\{(\w+)\}$/.exec(p);
    return <Fragment key={i}>{m && m[1] in nodes ? nodes[m[1]] : p}</Fragment>;
  });
}

const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({ locale: 'en', setLocale });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setState] = useState<Locale>(current);
  useEffect(() => {
    listeners.add(setState);
    return () => void listeners.delete(setState);
  }, []);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <Fragment key={locale}>{children}</Fragment>
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);
