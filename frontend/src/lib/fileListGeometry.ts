export type ClientRect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type FileListLayout = {
  gapX: number;
  gapY: number;
  isGrid: boolean;
  itemHeight: number;
  itemWidth: number;
  itemsPerRow: number;
  list: HTMLElement;
  padLeft: number;
  padTop: number;
};

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): ClientRect {
  return {
    bottom: Math.max(y1, y2),
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    top: Math.min(y1, y2),
  };
}

export function rectsIntersect(a: ClientRect, b: ClientRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function clipRect(rect: ClientRect, bounds: ClientRect): ClientRect {
  return {
    bottom: Math.min(rect.bottom, bounds.bottom),
    left: Math.max(rect.left, bounds.left),
    right: Math.min(rect.right, bounds.right),
    top: Math.max(rect.top, bounds.top),
  };
}

export function rectArea(rect: ClientRect): number {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
}

function readCssSize(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function measureFileListLayout(list: HTMLElement): FileListLayout {
  const style = getComputedStyle(list);
  const padLeft = readCssSize(style.paddingLeft, 8);
  const padTop = readCssSize(style.paddingTop, 8);
  const isGrid = list.classList.contains('grid-view');
  const iconSize = readCssSize(
    getComputedStyle(document.documentElement).getPropertyValue('--icon-size'),
    64,
  );

  let itemWidth = isGrid ? iconSize + 48 : Math.max(1, list.clientWidth - padLeft * 2);
  let itemHeight = isGrid ? iconSize + 56 : 36;
  let gapX = isGrid ? 12 : 0;
  let gapY = isGrid ? 12 : 0;

  const rendered = list.querySelectorAll<HTMLElement>('.file-item');
  const first = rendered[0];
  if (first) {
    itemWidth = first.offsetWidth || itemWidth;
    itemHeight = first.offsetHeight || itemHeight;
    const second = rendered[1];
    if (isGrid && second) {
      const firstRect = first.getBoundingClientRect();
      const secondRect = second.getBoundingClientRect();
      if (Math.abs(secondRect.top - firstRect.top) < 8) {
        gapX = Math.max(0, secondRect.left - firstRect.right);
      } else {
        gapY = Math.max(0, secondRect.top - firstRect.bottom);
      }
    }
  }

  const innerWidth = Math.max(0, list.clientWidth - padLeft * 2);
  const itemsPerRow = isGrid
    ? Math.max(1, Math.floor((innerWidth + gapX) / (itemWidth + gapX)))
    : 1;

  return {
    gapX,
    gapY,
    isGrid,
    itemHeight,
    itemWidth,
    itemsPerRow,
    list,
    padLeft,
    padTop,
  };
}

export function itemContentRect(layout: FileListLayout, index: number): ClientRect {
  const row = Math.floor(index / layout.itemsPerRow);
  const col = index % layout.itemsPerRow;
  const left = layout.padLeft + col * (layout.itemWidth + layout.gapX);
  const top = layout.padTop + row * (layout.itemHeight + layout.gapY);
  return {
    bottom: top + layout.itemHeight,
    left,
    right: left + layout.itemWidth,
    top,
  };
}

export function pathsIntersectingContentRect(
  layout: FileListLayout,
  entries: Array<{ path: string }>,
  contentRect: ClientRect,
): { indices: number[]; paths: string[] } {
  const indices: number[] = [];
  const paths: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    if (!rectsIntersect(itemContentRect(layout, index), contentRect)) continue;
    indices.push(index);
    paths.push(entries[index].path);
  }

  return { indices, paths };
}
