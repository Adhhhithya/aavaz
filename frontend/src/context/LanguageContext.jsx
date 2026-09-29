import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { LANGUAGES, translate } from '../i18n/translations';

const LanguageContext = createContext();

const STORAGE_KEY = 'aavaz_user_language';

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = useCallback((newLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.documentElement.lang = newLang;
      if (newLang === 'ur') {
        document.documentElement.dir = 'rtl';
      } else {
        document.documentElement.dir = 'ltr';
      }
    } catch (e) {
      console.warn('Could not persist language to localStorage', e);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (lang === 'ur') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
  }, [lang]);

  const t = useCallback((key, params = {}) => {
    return translate(key, lang, params);
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      lang: 'en',
      setLang: () => {},
      t: (key, params = {}) => translate(key, 'en', params),
      languages: LANGUAGES,
    };
  }
  return context;
}
