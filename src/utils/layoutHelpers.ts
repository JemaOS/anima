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

function getLayoutConfigKey(screenSize: string) {
  if (screenSize === "xxs") return "xxs";
  if (screenSize === "xs" || screenSize === "sm") return "xs";
  if (screenSize === "foldable" || screenSize === "md") return "md";
  return "lg";
}

export function calculateGridLayout(count: number, screenSize: string) {
  const configKey = getLayoutConfigKey(screenSize);
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

function getGap(screenSize: string) {
  if (screenSize === "xxs") return "4px";
  if (screenSize === "xs") return "6px";
  if (screenSize === "sm") return "8px";
  return "12px";
}

function getPadding(screenSize: string) {
  if (screenSize === "xxs") return "4px";
  if (screenSize === "xs") return "6px";
  return "8px";
}

export function calculateGridStyle(layout: { cols: number, rows: number }, count: number, screenSize: string) {
  const { cols } = layout;
  const actualRows = Math.ceil(count / cols);

  const gap = getGap(screenSize);

  return {
    display: "grid" as const,
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${actualRows}, 1fr)`,
    gap,
    height: "100%",
    width: "100%",
    padding: getPadding(screenSize),
  };
}