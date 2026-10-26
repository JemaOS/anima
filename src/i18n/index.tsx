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

const LANG_STORAGE_KEY = "jemaos_lang";

// Langue initiale : choix persisté de l'utilisateur, sinon langue du
// navigateur/système (en ou fr), sinon anglais. Les PWA suivent donc la
// langue du système/navigateur par défaut.
function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "fr") return saved;
  } catch {
    /* stockage indisponible */
  }
  try {
    const candidates =
      navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const candidate of candidates) {
      const short = (candidate || "").toLowerCase().split("-")[0];
      if (short === "en" || short === "fr") return short;
    }
  } catch {
    /* navigator indisponible */
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    setCurrentLang(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, newLang);
    } catch {
      /* stockage indisponible */
    }
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
