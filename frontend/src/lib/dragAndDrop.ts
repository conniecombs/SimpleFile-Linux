// @ts-ignore
import { state as appState } from './app/state.svelte.ts';
import {
  currentSelectionPaths,
  pathContains,
  pathsEqual,
  pathsFromNativeDropPayload,
  resetInternalDragState,
  selectPaths,
  selectSecondaryPaths,
  transferEntriesWithSafety,
} from './app/core';
import { basename, getParentPath, joinPath } from './coreFileManager';
import { isTauriRuntime } from './tauri';
import type { NativeFileDropEventPayload, PathString } from './types';
import type { TransferAction } from './transferPathUtils';

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

type DropKind = 'folder-item' | 'sidebar' | 'tree' | 'breadcrumb' | 'pane' | 'none';

type DropResolution = {
  action: TransferAction;
  destination: PathString | null;
  internal: boolean;
  kind: DropKind;
  label: string;
  target: HTMLElement | null;
  valid: boolean;
};

const modifiers = {
  alt: false,
  ctrl: false,
  meta: false,
  shift: false,
};

const ITEM_DRAG_THRESHOLD = 5;

let hoverPaths: PathString[] = [];
let lastCompletedKey = '';
let lastCompletedAt = 0;
let ghostElement: HTMLDivElement | null = null;
let fallbackActive = false;
let nativeDragPending = false;
let pendingItemDrag: { item: HTMLElement; path: PathString; x: number; y: number } | null = null;
let suppressClickAfterDrag = false;

function updateModifiers(event: KeyboardEvent | MouseEvent | DragEvent): void {
  modifiers.alt = event.altKey;
  modifiers.ctrl = event.ctrlKey;
  modifiers.meta = event.metaKey;
  modifiers.shift = event.shiftKey;
}

function currentAction(internal: boolean): TransferAction {
  if (modifiers.shift) return 'move';
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) return 'copy';
  return internal ? 'move' : 'copy';
}

function isInternalPaths(paths: PathString[]): boolean {
  const dragged = (appState.draggedItems || []) as PathString[];
  if (dragged.length === 0 || paths.length === 0) return false;
  return paths.every((path) => dragged.some((item) => pathsEqual(item, path)));
}

function pathFromNavigateAction(action: string | undefined): PathString | null {
  if (!action) return null;
  if (action === 'navigateHome') return (appState.homePath || null) as PathString | null;

  const key = action.replace(/^navigate/i, '').toLowerCase();
  const xdg = appState.xdgDirs?.[key];
  if (typeof xdg === 'string' && xdg) return xdg as PathString;

  const fallback: Record<string, string> = {
    desktop: 'Desktop',
    documents: 'Documents',
    downloads: 'Downloads',
    pictures: 'Pictures',
    music: 'Music',
    videos: 'Videos',
  };
  const folder = fallback[key];
  if (folder && appState.homePath) return joinPath(appState.homePath, folder);
  return null;
}

function panePath(pane: 'primary' | 'secondary'): PathString | null {
  if (pane === 'secondary') return (appState.secondaryPath || appState.currentPath || null) as PathString | null;
  return (appState.currentPath || null) as PathString | null;
}

function destinationValidity(
  destination: PathString | null,
  sources: PathString[],
  action: TransferAction,
): { reason: string; valid: boolean } {
  if (!destination) return { reason: 'No drop target', valid: false };
  if (sources.length === 0) return { reason: 'Nothing to drop', valid: false };

  if (sources.some((source) => pathsEqual(source, destination))) {
    return { reason: 'Cannot drop onto itself', valid: false };
  }

  if (sources.some((source) => pathContains(source, destination))) {
    return { reason: 'Cannot drop a folder into itself', valid: false };
  }

  if (action === 'move' && sources.every((source) => {
    const parent = getParentPath(source);
    return Boolean(parent && pathsEqual(parent, destination));
  })) {
    return { reason: 'Already in this folder', valid: false };
  }

  return { reason: '', valid: true };
}

function resolveDestinationFromElement(
  element: Element | null,
): { destination: PathString | null; kind: DropKind; target: HTMLElement | null } {
  if (!element) return { destination: null, kind: 'none', target: null };

  const folderItem = element.closest<HTMLElement>('.file-item[data-is-dir="true"][data-path]');
  if (folderItem?.dataset.path) {
    return { destination: folderItem.dataset.path as PathString, kind: 'folder-item', target: folderItem };
  }

  const treeItem = element.closest<HTMLElement>('.tree-item[data-path]');
  if (treeItem?.dataset.path) {
    return { destination: treeItem.dataset.path as PathString, kind: 'tree', target: treeItem };
  }

  const sidebarItem = element.closest<HTMLElement>(
    '.quick-access-item[data-path], .quick-access-item[data-action], .bookmark-item[data-path], .recent-item[data-path]',
  );
  if (sidebarItem) {
    const fromPath = sidebarItem.dataset.path as PathString | undefined;
    const fromAction = pathFromNavigateAction(sidebarItem.dataset.action);
    const destination = fromPath || fromAction;
    if (destination) return { destination, kind: 'sidebar', target: sidebarItem };
  }

  const crumb = element.closest<HTMLElement>('.breadcrumb-segment[data-path]');
  if (crumb?.dataset.path) {
    return { destination: crumb.dataset.path as PathString, kind: 'breadcrumb', target: crumb };
  }

  if (element.closest('#secondary-file-list, #pane-secondary')) {
    const list = document.getElementById('secondary-file-list');
    return { destination: panePath('secondary'), kind: 'pane', target: list };
  }

  if (element.closest('#file-list, #pane-primary, .primary-pane')) {
    const list = document.getElementById('file-list');
    return { destination: panePath('primary'), kind: 'pane', target: list };
  }

  return { destination: null, kind: 'none', target: null };
}

export function resolveDropAtPoint(clientX: number, clientY: number, sources: PathString[]): DropResolution {
  const raw = document.elementFromPoint(clientX, clientY);
  const found = resolveDestinationFromElement(raw);
  const internal = isInternalPaths(sources) || (Boolean(appState.isDragging) && sources.length > 0);
  let { destination, kind, target } = found;
  if (!destination && !internal) {
    destination = panePath('primary');
    kind = 'pane';
    target = document.getElementById('file-list');
  }
  const action = currentAction(internal);
  const { valid, reason } = destinationValidity(destination, sources, action);
  const folderName = destination ? basename(destination) : '';
  const verb = action === 'move' ? 'Move' : 'Copy';
  const label = !destination
    ? 'Drop to copy or move'
    : valid
      ? `${verb} to ${folderName || destination}`
      : reason;

  return {
    action,
    destination,
    internal,
    kind,
    label,
    target,
    valid,
  };
}

function clearDropHighlights(): void {
  document.querySelectorAll('.drag-over, .drag-over-invalid, .drag-over-empty, .drag-active').forEach((node) => {
    node.classList.remove('drag-over', 'drag-over-invalid', 'drag-over-empty', 'drag-active');
    if (node instanceof HTMLElement) node.removeAttribute('data-drop-label');
  });
}

function applyDropHighlight(resolution: DropResolution | null): void {
  clearDropHighlights();
  document.querySelectorAll('.file-list').forEach((list) => list.classList.add('drag-active'));

  if (!resolution?.target || !resolution.destination) return;

  const target = resolution.target;
  target.dataset.dropLabel = resolution.label;
  if (!resolution.valid) {
    target.classList.add('drag-over-invalid');
    return;
  }

  if (target.classList.contains('file-list')) target.classList.add('drag-over-empty');
  else target.classList.add('drag-over');
}

function setDraggingVisuals(paths: PathString[], active: boolean): void {
  document.querySelectorAll<HTMLElement>('.file-item[data-path], .tree-item[data-path]').forEach((node) => {
    const path = node.dataset.path;
    if (!path) return;
    const match = paths.some((item) => pathsEqual(item, path));
    node.classList.toggle('dragging', active && match);
  });
}

function resetDragChrome(): void {
  clearDropHighlights();
  setDraggingVisuals((appState.draggedItems || []) as PathString[], false);
  ghostElement?.remove();
  ghostElement = null;
  fallbackActive = false;
  nativeDragPending = false;
  hoverPaths = [];
  resetInternalDragState();
  window.setTimeout(() => {
    suppressClickAfterDrag = false;
  }, 80);
}

function dropKey(paths: PathString[], destination: PathString, action: TransferAction): string {
  return `${action}|${destination}|${[...paths].sort().join('\n')}`;
}

function completeDrop(paths: PathString[], resolution: DropResolution): void {
  if (!resolution.destination || !resolution.valid || paths.length === 0) {
    return;
  }

  const key = dropKey(paths, resolution.destination, resolution.action);
  const now = Date.now();
  if (key === lastCompletedKey && now - lastCompletedAt < 700) return;
  lastCompletedKey = key;
  lastCompletedAt = now;

  const countLabel = paths.length === 1 ? basename(paths[0]) : `${paths.length} items`;
  const destName = basename(resolution.destination) || resolution.destination;
  void transferEntriesWithSafety(paths, resolution.destination, resolution.action, {
    successMessage: `${resolution.action === 'move' ? 'Moved' : 'Copied'} ${countLabel} to ${destName}`,
  });
}

function toClientPoint(position: { x?: unknown; y?: unknown } | null | undefined): { x: number; y: number } | null {
  if (!position) return null;
  const rawX = Number(position.x);
  const rawY = Number(position.y);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;

  const scale = window.devicePixelRatio || 1;
  const logical = { x: rawX, y: rawY };
  const scaled = { x: rawX / scale, y: rawY / scale };

  if (document.elementFromPoint(logical.x, logical.y)) return logical;
  if (document.elementFromPoint(scaled.x, scaled.y)) return scaled;
  if (
    logical.x >= 0
    && logical.y >= 0
    && logical.x <= window.innerWidth
    && logical.y <= window.innerHeight
  ) {
    return logical;
  }
  if (
    scaled.x >= 0
    && scaled.y >= 0
    && scaled.x <= window.innerWidth
    && scaled.y <= window.innerHeight
  ) {
    return scaled;
  }
  return logical;
}

function updateHoverAt(clientX: number, clientY: number, paths: PathString[]): DropResolution {
  const resolution = resolveDropAtPoint(clientX, clientY, paths);
  applyDropHighlight(resolution);
  return resolution;
}

function ensureGhost(paths: PathString[]): HTMLDivElement {
  if (ghostElement?.isConnected) return ghostElement;
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.innerHTML = `<span class="drag-icon" aria-hidden="true">📄</span><span class="drag-name"></span><span class="drag-count"></span>`;
  document.body.appendChild(ghost);
  ghostElement = ghost;
  const name = ghost.querySelector('.drag-name');
  const count = ghost.querySelector('.drag-count');
  if (name) name.textContent = paths.length === 1 ? basename(paths[0]) : `${paths.length} items`;
  if (count) {
    count.textContent = String(paths.length);
    (count as HTMLElement).hidden = paths.length < 2;
  }
  return ghost;
}

function moveGhost(clientX: number, clientY: number): void {
  if (!ghostElement) return;
  ghostElement.style.left = `${clientX + 14}px`;
  ghostElement.style.top = `${clientY + 14}px`;
}

function makeDragIcon(count: number): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return TRANSPARENT_PIXEL;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 56, 56, 10);
    ctx.fill();
    ctx.fillStyle = '#89b4fa';
    ctx.font = '700 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(count > 99 ? '99+' : String(count), 32, 34);
    return canvas.toDataURL('image/png');
  } catch {
    return TRANSPARENT_PIXEL;
  }
}

function selectionForDragSource(path: PathString, item: HTMLElement): PathString[] {
  const inSecondary = Boolean(item.closest('#secondary-file-list'));
  const selected = inSecondary
    ? [...(appState.secondarySelectedEntries || new Set<PathString>())] as PathString[]
    : currentSelectionPaths();

  if (item.classList.contains('tree-item')) return [path];

  if (selected.includes(path)) return selected;

  const index = Number(item.dataset.index ?? -1);
  if (inSecondary) selectSecondaryPaths([path], Number.isFinite(index) ? index : -1);
  else selectPaths([path], Number.isFinite(index) ? index : -1);
  return [path];
}

function beginFallbackDrag(paths: PathString[]): void {
  if (fallbackActive) return;
  fallbackActive = true;
  ensureGhost(paths);
  const handleMove = (event: MouseEvent) => {
    updateModifiers(event);
    moveGhost(event.clientX, event.clientY);
    updateHoverAt(event.clientX, event.clientY, paths);
  };
  const handleUp = (event: MouseEvent) => {
    document.removeEventListener('mousemove', handleMove, true);
    document.removeEventListener('mouseup', handleUp, true);
    updateModifiers(event);
    const resolution = resolveDropAtPoint(event.clientX, event.clientY, paths);
    completeDrop(paths, resolution);
    resetDragChrome();
  };
  document.addEventListener('mousemove', handleMove, true);
  document.addEventListener('mouseup', handleUp, true);
}

async function beginNativeDrag(paths: PathString[]): Promise<void> {
  nativeDragPending = true;
  try {
    const { startDrag } = await import('@crabnebula/tauri-plugin-drag');
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (!(await win.isFocused())) await win.setFocus();
    } catch {
      /* Focusing is best-effort for Wayland compositors. */
    }

    await startDrag(
      {
        icon: makeDragIcon(paths.length),
        item: paths,
        mode: currentAction(true),
      },
      (payload) => {
        if (payload.result !== 'Dropped') return;
        const point = toClientPoint(payload.cursorPos);
        if (!point) return;
        const resolution = resolveDropAtPoint(point.x, point.y, paths);
        completeDrop(paths, resolution);
      },
    );
  } catch (error) {
    console.error('Native drag error:', error);
    beginFallbackDrag(paths);
    return;
  } finally {
    window.setTimeout(() => {
      if (!fallbackActive) resetDragChrome();
    }, 80);
  }
}

function ignoredDragSource(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  return Boolean(element?.closest('button, input, textarea, select, a, .resize-handle, .pane-divider'));
}

function beginItemDrag(path: PathString, item: HTMLElement, event?: DragEvent | MouseEvent): PathString[] {
  if (event) updateModifiers(event);
  const paths = selectionForDragSource(path, item);
  if (paths.length === 0) return [];

  pendingItemDrag = null;
  suppressClickAfterDrag = true;
  appState.draggedItems = paths;
  appState.isDragging = true;
  setDraggingVisuals(paths, true);
  document.querySelectorAll('.file-list').forEach((list) => list.classList.add('drag-active'));
  return paths;
}

function handleDragStart(event: DragEvent): void {
  if (appState.isDragging || nativeDragPending || fallbackActive) {
    event.preventDefault();
    return;
  }
  if (ignoredDragSource(event.target)) return;

  const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('.file-item[data-path], .tree-item[data-path]');
  const path = item?.dataset.path as PathString | undefined;
  if (!item || !path) return;

  const paths = beginItemDrag(path, item, event);
  if (paths.length === 0) return;

  event.dataTransfer?.setData('text/plain', paths.join('\n'));
  event.dataTransfer?.setData('text/uri-list', paths.map((itemPath) => `file://${itemPath}`).join('\n'));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copyMove';

  if (isTauriRuntime()) {
    event.preventDefault();
    void beginNativeDrag(paths);
    return;
  }

  try {
    const ghost = ensureGhost(paths);
    event.dataTransfer?.setDragImage(ghost, 12, 12);
  } catch {
    /* setDragImage is optional. */
  }
}

function handleItemPointerDown(event: MouseEvent): void {
  if (event.button !== 0 || ignoredDragSource(event.target)) return;
  const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('.file-item[data-path], .tree-item[data-path]');
  const path = item?.dataset.path as PathString | undefined;
  if (!item || !path) return;
  pendingItemDrag = { item, path, x: event.clientX, y: event.clientY };
}

function handleItemPointerMove(event: MouseEvent): void {
  if (!pendingItemDrag || appState.isDragging || nativeDragPending || fallbackActive) return;
  const dx = event.clientX - pendingItemDrag.x;
  const dy = event.clientY - pendingItemDrag.y;
  if ((dx * dx) + (dy * dy) < ITEM_DRAG_THRESHOLD * ITEM_DRAG_THRESHOLD) return;

  const { item, path } = pendingItemDrag;
  const paths = beginItemDrag(path, item, event);
  if (paths.length === 0) return;

  if (isTauriRuntime()) {
    void beginNativeDrag(paths);
    return;
  }
  beginFallbackDrag(paths);
}

function handleItemPointerUp(): void {
  pendingItemDrag = null;
}

function handleClickAfterDrag(event: MouseEvent): void {
  if (!suppressClickAfterDrag) return;
  event.preventDefault();
  event.stopPropagation();
  window.setTimeout(() => {
    suppressClickAfterDrag = false;
  }, 0);
}

function handleDragOver(event: DragEvent): void {
  const types = Array.from(event.dataTransfer?.types || []);
  const hasInternal = ((appState.draggedItems as PathString[] | undefined)?.length || 0) > 0;
  const hasFiles = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain');
  if (!hasInternal && !hasFiles) return;

  updateModifiers(event);
  event.preventDefault();
  const paths = hasInternal
    ? [...(appState.draggedItems as PathString[])]
    : hoverPaths;
  const resolution = updateHoverAt(event.clientX, event.clientY, paths);
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = resolution.action === 'copy' ? 'copy' : 'move';
  }
}

function pathsFromDataTransfer(transfer: DataTransfer | null): PathString[] {
  if (!transfer) return [];
  const files = Array.from(transfer.files || []).map((file) => {
    const withPath = file as File & { path?: string };
    return (withPath.path || '') as PathString;
  }).filter(Boolean);
  if (files.length > 0) return files;

  const uriList = transfer.getData('text/uri-list') || '';
  const fromUri = uriList
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.startsWith('file://'))
    .map((line) => decodeURIComponent(line.replace(/^file:\/\//, ''))) as PathString[];
  if (fromUri.length > 0) return fromUri;

  const text = transfer.getData('text/plain') || '';
  return text.split('\n').map((line) => line.trim()).filter(Boolean) as PathString[];
}

function handleDrop(event: DragEvent): void {
  const internal = [...((appState.draggedItems || []) as PathString[])];
  const paths = internal.length > 0 ? internal : pathsFromDataTransfer(event.dataTransfer);
  if (paths.length === 0) return;

  updateModifiers(event);
  event.preventDefault();
  const resolution = resolveDropAtPoint(event.clientX, event.clientY, paths);
  completeDrop(paths, resolution);
  resetDragChrome();
}

function handleDragEnd(): void {
  if (nativeDragPending) return;
  resetDragChrome();
}

function handleNativeHover(event: { payload: NativeFileDropEventPayload }): void {
  const payload = event.payload as { paths?: PathString[]; files?: PathString[]; position?: { x: number; y: number } };
  const paths = pathsFromNativeDropPayload(event.payload);
  if (paths.length > 0) hoverPaths = paths;
  const point = toClientPoint(payload?.position);
  if (!point) return;
  updateHoverAt(point.x, point.y, hoverPaths.length > 0 ? hoverPaths : paths);
}

function handleNativeDrop(event: { payload: NativeFileDropEventPayload }): void {
  const payload = event.payload as { paths?: PathString[]; files?: PathString[]; position?: { x: number; y: number } };
  const paths = pathsFromNativeDropPayload(event.payload);
  const point = toClientPoint(payload?.position);
  const sources = paths.length > 0 ? paths : hoverPaths;
  if (sources.length === 0) {
    resetDragChrome();
    return;
  }

  const resolution = point
    ? resolveDropAtPoint(point.x, point.y, sources)
    : {
        action: currentAction(isInternalPaths(sources)),
        destination: appState.currentPath as PathString,
        internal: isInternalPaths(sources),
        kind: 'pane' as const,
        label: '',
        target: document.getElementById('file-list'),
        valid: Boolean(appState.currentPath),
      };

  completeDrop(sources, resolution);
  resetDragChrome();
}

function handleNativeLeave(): void {
  hoverPaths = [];
  if (!appState.isDragging) clearDropHighlights();
}

function handleKey(event: KeyboardEvent): void {
  updateModifiers(event);
}

export function installDragAndDrop(): () => void {
  document.addEventListener('mousedown', handleItemPointerDown, true);
  document.addEventListener('mousemove', handleItemPointerMove, true);
  document.addEventListener('mouseup', handleItemPointerUp, true);
  document.addEventListener('click', handleClickAfterDrag, true);
  document.addEventListener('dragstart', handleDragStart, true);
  document.addEventListener('dragover', handleDragOver, true);
  document.addEventListener('drop', handleDrop, true);
  document.addEventListener('dragend', handleDragEnd, true);
  document.addEventListener('dragleave', (event) => {
    if (event.target === document.documentElement || event.target === document.body) {
      if (!appState.isDragging) clearDropHighlights();
    }
  }, true);
  window.addEventListener('keydown', handleKey, true);
  window.addEventListener('keyup', handleKey, true);

  const nativeListeners = import('./api').then(async (api) => {
    const unlistens = await Promise.all([
      api.onExternalFileDropHover(handleNativeHover),
      api.onExternalFileDropOver(handleNativeHover),
      api.onExternalFileDrop(handleNativeDrop),
      api.onExternalFileDropLeave(handleNativeLeave),
    ]);
    return () => {
      for (const unlisten of unlistens) void unlisten();
    };
  }).catch(() => () => {});

  return () => {
    document.removeEventListener('mousedown', handleItemPointerDown, true);
    document.removeEventListener('mousemove', handleItemPointerMove, true);
    document.removeEventListener('mouseup', handleItemPointerUp, true);
    document.removeEventListener('click', handleClickAfterDrag, true);
    document.removeEventListener('dragstart', handleDragStart, true);
    document.removeEventListener('dragover', handleDragOver, true);
    document.removeEventListener('drop', handleDrop, true);
    document.removeEventListener('dragend', handleDragEnd, true);
    window.removeEventListener('keydown', handleKey, true);
    window.removeEventListener('keyup', handleKey, true);
    void nativeListeners.then((unlisten) => unlisten());
    resetDragChrome();
  };
}
