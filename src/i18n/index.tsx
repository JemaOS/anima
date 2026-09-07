// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  translations,
  type Lang,
  type TranslationKey,
  type TranslationParams,
  setCurrentLang,
} from "./translations";

type TFunction = (
  key: TranslationKey,
  params?: TranslationParams,
) => string;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // French by default for JemaOS PWAs; the LanguageSelector is a
  // session-only override (never persisted).
  const [lang, setLangState] = useState<Lang>("fr");

  useEffect(() => {
    setCurrentLang(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
  };

  const t: TFunction = (key, params) => {
    let value: string =
      translations[lang][key] ?? translations.en[key] ?? key;
    if (params) {
      for (const [name, paramValue] of Object.entries(params)) {
        value = value
          .split(`{${name}}`)
          .join(String(paramValue));
      }
    }
    return value;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error(
      "useI18n must be used within an I18nProvider",
    );
  }
  return context;
}
