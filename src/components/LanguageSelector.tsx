// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import React, { useState, useEffect } from "react";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import { useI18n } from "@/i18n";

function LanguageSelector() {
  const { lang, setLang } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (langCode: Lang) => {
    setLang(langCode);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".language-selector")) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () =>
        document.removeEventListener("click", handleClickOutside);
    }
  }, [isOpen]);

  const currentLangData = LANGUAGES[lang] || LANGUAGES.en;
  const otherLang = lang === "en" ? "fr" : "en";

  return (
    <div
      className="relative language-selector"
      onClick={() => setIsOpen(!isOpen)}
    >
      <button
        type="button"
        className="h-9 px-2.5 flex items-center gap-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-gray-300 text-xs font-medium transition-colors duration-200"
        title={`${currentLangData.name} / ${LANGUAGES[otherLang].name}`}
        aria-label="Language"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <path d="M5 8l6 6M4 14h8M5.5 14l2-6h1l2 6" />
          <path d="M14 5h6M17 5v9M14 9h6" />
        </svg>
        <span>
          {lang.toUpperCase()}/{otherLang.toUpperCase()}
        </span>
        <span className="text-[8px] leading-none">▼</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-32 rounded-lg bg-[#1a1a2e] border border-white/[0.08] shadow-lg overflow-hidden z-50">
          {Object.values(LANGUAGES).map((language) => (
            <button
              key={language.code}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(language.code);
              }}
              className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                lang === language.code
                  ? "bg-[#8f88ed]/15 text-[#8f88ed] font-medium"
                  : "text-gray-300 hover:bg-white/[0.05]"
              }`}
            >
              {language.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LanguageSelector;
