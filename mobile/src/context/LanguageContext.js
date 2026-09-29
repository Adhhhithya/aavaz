import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { LANGUAGES, translate } from '../i18n/translations';
import { storage } from '../services/storage';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');

  useEffect(() => {
    storage.getLanguage().then(saved => {
      if (saved) setLangState(saved);
    });
  }, []);

  const setLang = useCallback(async (newLang) => {
    setLangState(newLang);
    await storage.saveLanguage(newLang);
  }, []);

  const t = useCallback((key, params = {}) => {
    return translate(key, lang, params);
  }, [lang]);

  return (
    <LanguageContext.Provider
      value={{
        lang,
        language: lang,
        setLang,
        setLanguage: setLang,
        changeLanguage: setLang,
        t,
        languages: LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      lang: 'en',
      language: 'en',
      setLang: () => {},
      setLanguage: () => {},
      changeLanguage: () => {},
      t: (key, params = {}) => translate(key, 'en', params),
      languages: LANGUAGES,
    };
  }
  return context;
}
