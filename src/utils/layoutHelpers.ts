export function calculateGridLayout(count: number, screenSize: string) {
  // For ultra-small screens (iPhone 5s - 320px)
  if (screenSize === "xxs") {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 1, rows: 2 };
    if (count <= 4) return { cols: 2, rows: 2 };
    return { cols: 2, rows: Math.ceil(count / 2) };
  }

  // For very small screens (4-5 inch phones)
  if (screenSize === "xs") {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 1, rows: 2 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 2, rows: 3 };
    return { cols: 2, rows: 4 };
  }

  // For small screens (5-6 inch phones)
  if (screenSize === "sm") {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 1, rows: 2 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 2, rows: 3 };
    return { cols: 2, rows: 4 };
  }

  // For foldable devices (Honor Magic V3, etc.)
  if (screenSize === "foldable") {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    return { cols: 3, rows: 3 };
  }

  // For medium screens (6-8 inch phones/tablets)
  if (screenSize === "md") {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    return { cols: 3, rows: 3 };
  }

  // For large screens (tablets and desktops)
  if (count === 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 4, rows: 2 };
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