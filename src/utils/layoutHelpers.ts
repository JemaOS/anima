type Layout = { cols: number; rows: number };

const LAYOUT_CONFIGS: Record<string, (count: number) => Layout> = {
  xxs: (count) => {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 1, rows: 2 };
    if (count <= 4) return { cols: 2, rows: 2 };
    return { cols: 2, rows: Math.ceil(count / 2) };
  },
  xs: (count) => {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 1, rows: 2 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 2, rows: 3 };
    return { cols: 2, rows: 4 };
  },
  md: (count) => {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    return { cols: 3, rows: 3 };
  },
  lg: (count) => {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    return { cols: 4, rows: 2 };
  }
};

export function calculateGridLayout(count: number, screenSize: string) {
  const configKey = 
    screenSize === "xxs" ? "xxs" :
    (screenSize === "xs" || screenSize === "sm") ? "xs" :
    (screenSize === "foldable" || screenSize === "md") ? "md" :
    "lg";
    
  return LAYOUT_CONFIGS[configKey](count);
}

export function calculateTileSize(count: number, screenSize: string): "small" | "medium" | "large" {
  if (count === 1) return "large";
  if (screenSize === "xs" || screenSize === "sm") {
    if (count === 2) return "medium";
    return "small";
  }
  if (count === 2) return "large";
  if (count <= 4) return "medium";
  return "small";
}

export function calculateGridStyle(layout: { cols: number, rows: number }, count: number, screenSize: string) {
  const { cols } = layout;
  const actualRows = Math.ceil(count / cols);

  const gap =
    screenSize === "xxs" ? "4px" :
    screenSize === "xs" ? "6px" :
    screenSize === "sm" ? "8px" : "12px";

  return {
    display: "grid" as const,
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${actualRows}, 1fr)`,
    gap,
    height: "100%",
    width: "100%",
    padding: screenSize === "xxs" ? "4px" : screenSize === "xs" ? "6px" : "8px",
  };
}