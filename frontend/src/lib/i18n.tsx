import React, { createContext, useContext, useEffect, useState } from 'react';
import TRANSLATIONS from '@/i18n/translations_fixed';

type Lang = keyof typeof TRANSLATIONS;

// Friendly display names (native or English fallback) for the languages we support
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'हिन्दी',
  bn: 'বাংলা',
  mr: 'मराठी',
  te: 'తెలుగు',
  ta: 'தமிழ்',
  gu: 'ગુજરાતી',
  kn: 'ಕನ್ನಡ',
  pa: 'ਪੰਜਾਬੀ',
  ml: 'മലയാളം'
};

const DEFAULT_LANG: Lang = 'en';

const I18nContext = createContext({
  lang: DEFAULT_LANG as Lang,
  setLang: (l: Lang) => {},
  t: (k: string) => k,
  available: Object.keys(TRANSLATIONS) as Lang[],
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('kb_lang') as Lang | null;
      if (stored && TRANSLATIONS[stored]) setLangState(stored);
    } catch (e) {
      // ignore
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('kb_lang', l); } catch (e) {}
  };

  const t = (key: string) => {
    return TRANSLATIONS[lang]?.[key] ?? key;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t, available: Object.keys(TRANSLATIONS) as Lang[] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
