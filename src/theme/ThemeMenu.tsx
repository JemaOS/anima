import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Icon } from "@/components/ui";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { useTheme } from "./context";
import type { Theme } from "./theme";

const THEME_OPTIONS: ReadonlyArray<{
  value: Theme;
  icon: string;
  labelKey: TranslationKey;
}> = [
  { value: "system", icon: "monitor", labelKey: "themeSystem" },
  { value: "light", icon: "sun", labelKey: "themeLight" },
  { value: "dark", icon: "moon", labelKey: "themeDark" },
];

export function ThemeMenu() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const currentOption =
    THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[0];
  const triggerIcon =
    theme === "system" ? "monitor" : resolvedTheme === "dark" ? "moon" : "sun";
  const triggerLabel = `${t("theme")} : ${t(currentOption.labelKey)}`;

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = Math.max(
      0,
      THEME_OPTIONS.findIndex((option) => option.value === theme),
    );
    optionRefs.current[selectedIndex]?.focus();

    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, theme]);

  const moveFocus = useCallback((direction: 1 | -1) => {
    const items = optionRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null,
    );
    if (items.length === 0) return;
    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    );
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }, []);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu(true);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "Home":
        event.preventDefault();
        optionRefs.current[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        optionRefs.current[THEME_OPTIONS.length - 1]?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const handleSelect = (value: Theme) => {
    setTheme(value);
    closeMenu(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        title={triggerLabel}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
        className="h-9 w-9 flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--control-bg)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--control-hover)] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
      >
        <Icon name={triggerIcon} size={18} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("theme")}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-elevated)] shadow-elevated overflow-hidden z-50"
        >
          {THEME_OPTIONS.map((option, index) => {
            const selected = option.value === theme;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={-1}
                onClick={() => handleSelect(option.value)}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 ${
                  selected
                    ? "bg-[#8f88ed]/15 text-[#8f88ed] font-medium"
                    : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--control-hover)]"
                }`}
              >
                <Icon name={option.icon} size={16} />
                <span className="flex-1">{t(option.labelKey)}</span>
                {selected && <Icon name="check" size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
