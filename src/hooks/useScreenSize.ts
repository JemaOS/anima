import { useState, useEffect } from "react";

// Hook personnalisé pour détecter la taille de l'écran - optimisé
export function useScreenSize() {
  const [screenSize, setScreenSize] = useState<"xxs" | "xs" | "sm" | "md" | "lg" | "foldable">("md");

  useEffect(() => {
    // Utiliser requestAnimationFrame pour éviter les recalculs excessifs
    let rafId: number | null = null;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    const updateSize = () => {
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const aspectRatio = width / height;

        // Ne mettre à jour que si la taille a significativement changé
        if (Math.abs(width - lastWidth) < 20 && Math.abs(height - lastHeight) < 20) {
          return;
        }

        lastWidth = width;
        lastHeight = height;

        // Detect foldable devices (Honor Magic V3, Samsung Fold, etc.)
        // These typically have unusual aspect ratios when unfolded
        const isFoldable =
          /Magic V|Fold|Flip/i.test(navigator.userAgent) ||
          (width > 700 && width < 900 && aspectRatio > 0.8 && aspectRatio < 1.2);

        if (isFoldable) {
          setScreenSize("foldable");
        } else if (width < 340) {
          setScreenSize("xxs"); // iPhone 5s, SE (1st gen)
        } else if (width < 380 || (width < 500 && height < 700)) {
          setScreenSize("xs");
        } else if (width < 640) {
          setScreenSize("sm");
        } else if (width < 900) {
          setScreenSize("md");
        } else {
          setScreenSize("lg");
        }
      });
    };

    updateSize();
    window.addEventListener("resize", updateSize, { passive: true });
    return () => {
      window.removeEventListener("resize", updateSize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return screenSize;
}