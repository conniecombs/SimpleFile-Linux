// @ts-ignore
import { state as appState } from './app/state.svelte.ts';
import {
  filteredEntriesForPane,
  selectedSetForPane,
  selectPanePaths,
} from './app/core';
import type { PaneId } from './fileNavigation';
import {
  clipRect,
  measureFileListLayout,
  normalizeRect,
  pathsIntersectingContentRect,
  rectArea,
  type ClientRect,
} from './fileListGeometry';

const MARQUEE_THRESHOLD = 4;
const AUTO_SCROLL_EDGE = 32;
const AUTO_SCROLL_MAX = 28;

type MarqueeSession = {
  additive: boolean;
  basePaths: string[];
  list: HTMLElement;
  pane: PaneId;
  startClientX: number;
  startClientY: number;
  startListLeft: number;
  startListTop: number;
  startScrollTop: number;
};

let session: MarqueeSession | null = null;
let selecting = false;
let suppressClick = false;
let rectElement: HTMLDivElement | null = null;
let lastClientX = 0;
let lastClientY = 0;
let scrollFrame = 0;

function fileListFromEvent(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof Element ? target : null;
  return element?.closest<HTMLElement>('#file-list, #secondary-file-list') ?? null;
}

function paneForList(list: HTMLElement): PaneId {
  return list.id === 'secondary-file-list' ? 'secondary' : 'primary';
}

function shouldIgnorePointer(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  if (!element) return true;
  return Boolean(
    element.closest(
      'input, textarea, select, button, a, .resize-handle, .pane-divider, #context-menu, .modal-overlay, .command-palette-overlay',
    ),
  );
}

function ensureRect(): HTMLDivElement {
  if (rectElement?.isConnected) return rectElement;
  const rect = document.createElement('div');
  rect.id = 'selection-rect';
  rect.className = 'selection-rect';
  rect.hidden = true;
  document.body.appendChild(rect);
  rectElement = rect;
  return rect;
}

function hideRect(): void {
  if (!rectElement) return;
  rectElement.hidden = true;
  rectElement.style.width = '0px';
  rectElement.style.height = '0px';
}

function paintRect(visual: ClientRect): void {
  const rect = ensureRect();
  const width = Math.max(0, visual.right - visual.left);
  const height = Math.max(0, visual.bottom - visual.top);
  if (width < 1 || height < 1) {
    rect.hidden = true;
    return;
  }

  rect.hidden = false;
  rect.style.left = `${visual.left}px`;
  rect.style.top = `${visual.top}px`;
  rect.style.width = `${width}px`;
  rect.style.height = `${height}px`;
}

function contentRectForPointer(clientX: number, clientY: number): ClientRect | null {
  if (!session) return null;
  const listRect = session.list.getBoundingClientRect();
  return normalizeRect(
    session.startClientX - session.startListLeft,
    session.startClientY - session.startListTop + session.startScrollTop,
    clientX - listRect.left,
    clientY - listRect.top + session.list.scrollTop,
  );
}

function visualRectForContent(contentRect: ClientRect): ClientRect {
  if (!session) return contentRect;
  const listRect = session.list.getBoundingClientRect();
  const mapped = {
    bottom: listRect.top + contentRect.bottom - session.list.scrollTop,
    left: listRect.left + contentRect.left,
    right: listRect.left + contentRect.right,
    top: listRect.top + contentRect.top - session.list.scrollTop,
  };
  return clipRect(mapped, {
    bottom: listRect.bottom,
    left: listRect.left,
    right: listRect.right,
    top: listRect.top,
  });
}

function applyMarqueeSelection(clientX: number, clientY: number): void {
  if (!session) return;

  const contentRect = contentRectForPointer(clientX, clientY);
  if (!contentRect) return;

  const layout = measureFileListLayout(session.list);
  const entries = filteredEntriesForPane(session.pane);
  const hit = pathsIntersectingContentRect(layout, entries, contentRect);
  const next = new Set(session.additive ? session.basePaths : []);
  for (const path of hit.paths) next.add(path);

  const focusedIndex = hit.indices.length > 0 ? hit.indices[hit.indices.length - 1] : -1;
  selectPanePaths(session.pane, [...next], focusedIndex);

  const visual = visualRectForContent(contentRect);
  if (rectArea(visual) >= 1) paintRect(visual);
  else hideRect();
}

function autoScrollStep(): void {
  scrollFrame = 0;
  if (!session || !selecting) return;

  const listRect = session.list.getBoundingClientRect();
  let delta = 0;
  if (lastClientY < listRect.top + AUTO_SCROLL_EDGE) {
    const intensity = (listRect.top + AUTO_SCROLL_EDGE - lastClientY) / AUTO_SCROLL_EDGE;
    delta = -Math.ceil(AUTO_SCROLL_MAX * Math.min(1, Math.max(0.15, intensity)));
  } else if (lastClientY > listRect.bottom - AUTO_SCROLL_EDGE) {
    const intensity = (lastClientY - (listRect.bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE;
    delta = Math.ceil(AUTO_SCROLL_MAX * Math.min(1, Math.max(0.15, intensity)));
  }

  if (delta !== 0) {
    const previous = session.list.scrollTop;
    session.list.scrollTop = Math.max(
      0,
      Math.min(session.list.scrollHeight - session.list.clientHeight, previous + delta),
    );
  }

  applyMarqueeSelection(lastClientX, lastClientY);

  if (selecting) {
    scrollFrame = window.requestAnimationFrame(autoScrollStep);
  }
}

function beginSelecting(): void {
  if (!session || selecting) return;
  selecting = true;
  suppressClick = true;
  session.list.classList.add('selecting');
  document.body.classList.add('marquee-selecting');
  applyMarqueeSelection(lastClientX, lastClientY);
  if (!scrollFrame) scrollFrame = window.requestAnimationFrame(autoScrollStep);
}

function endSession(clearEmptyClick = false): void {
  if (scrollFrame) {
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  }

  const ended = session;
  const didSelect = selecting;
  session?.list.classList.remove('selecting');
  document.body.classList.remove('marquee-selecting');
  hideRect();
  session = null;
  selecting = false;

  if (!didSelect && clearEmptyClick && ended) {
    if (ended.additive) return;
    selectPanePaths(ended.pane, [], -1);
  }
}

function handleMouseDown(event: MouseEvent): void {
  if (event.button !== 0 || event.altKey) return;
  if (appState.isDragging) return;
  if (shouldIgnorePointer(event.target)) return;

  const list = fileListFromEvent(event.target);
  if (!list) return;

  const onItem = event.target instanceof Element
    ? event.target.closest('.file-item')
    : null;
  if (onItem) return;

  const pane = paneForList(list);
  const listRect = list.getBoundingClientRect();
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  session = {
    additive,
    basePaths: additive ? [...selectedSetForPane(pane)] : [],
    list,
    pane,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startListLeft: listRect.left,
    startListTop: listRect.top,
    startScrollTop: list.scrollTop,
  };
  lastClientX = event.clientX;
  lastClientY = event.clientY;
  appState.activePane = pane;
}

function handleMouseMove(event: MouseEvent): void {
  if (!session) return;
  lastClientX = event.clientX;
  lastClientY = event.clientY;

  if (!selecting) {
    const dx = event.clientX - session.startClientX;
    const dy = event.clientY - session.startClientY;
    if ((dx * dx) + (dy * dy) < MARQUEE_THRESHOLD * MARQUEE_THRESHOLD) return;
    event.preventDefault();
    beginSelecting();
    return;
  }

  event.preventDefault();
  applyMarqueeSelection(event.clientX, event.clientY);
}

function handleMouseUp(event: MouseEvent): void {
  if (!session) return;
  if (selecting) {
    applyMarqueeSelection(event.clientX, event.clientY);
    endSession(false);
    window.setTimeout(() => {
      suppressClick = false;
    }, 50);
    return;
  }

  const startedOnEmpty = true;
  endSession(startedOnEmpty);
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && session) {
    endSession(false);
  }
}

function handleClickCapture(event: MouseEvent): void {
  if (!suppressClick) return;
  event.preventDefault();
  event.stopPropagation();
  suppressClick = false;
}

function handleBlur(): void {
  if (session) endSession(false);
}

export function installMarqueeSelection(): () => void {
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseup', handleMouseUp, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('click', handleClickCapture, true);
  window.addEventListener('blur', handleBlur);

  return () => {
    endSession(false);
    document.removeEventListener('mousedown', handleMouseDown, true);
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('mouseup', handleMouseUp, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('click', handleClickCapture, true);
    window.removeEventListener('blur', handleBlur);
    rectElement?.remove();
    rectElement = null;
  };
}
