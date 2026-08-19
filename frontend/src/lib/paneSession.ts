import type { ArchiveInfo, FileEntry, GitStatus, PathString } from './types';

export type PaneId = 'primary' | 'secondary';
export const PANE_IDS: readonly PaneId[] = ['primary', 'secondary'];

export type HistoryMode = 'push' | 'replace-current' | 'none';

export interface PaneTab {
  id: string;
  path: PathString;
  title: string;
  history: PathString[];
  historyIndex: number;
}

export interface PaneSearchState {
  query: string;
  results: FileEntry[];
  isSearching: boolean;
  searchMode: boolean;
  currentSearchId: string | null;
  cancelled: boolean;
  options: Record<string, unknown> | null;
  savedEntries: FileEntry[] | null;
}

export interface PaneSession {
  path: PathString;
  entries: FileEntry[];
  filteredEntries: FileEntry[];
  selectedEntries: Set<PathString>;
  lastSelectedIndex: number;
  focusedIndex: number;
  history: PathString[];
  historyIndex: number;
  sortBy: string;
  sortAsc: boolean;
  isGridView: boolean;
  showHiddenFiles: boolean;
  filterOpen: boolean;
  filterQuery: string;
  tabs: PaneTab[];
  activeTabId: string | null;
  search: PaneSearchState;
  currentArchive: ArchiveInfo | null;
  gitStatus: GitStatus | null;
  typeAheadBuffer: string;
  typeAheadTimeout: number | null;
}

export interface PanePair {
  primary: PaneSession;
  secondary: PaneSession;
}

export interface PaneHost {
  activePane: PaneId;
  panes: PanePair;
}

export interface PersistedPaneSession {
  activeTabId: string | null;
  history: PathString[];
  historyIndex: number;
  isGridView: boolean;
  path: PathString;
  showHiddenFiles: boolean;
  sortAsc: boolean;
  sortBy: string;
  tabs: PaneTab[];
}

export interface PersistedPaneSessions {
  activePane: PaneId;
  dualPaneEnabled: boolean;
  primary: PersistedPaneSession;
  secondary: PersistedPaneSession;
}

export function otherPaneId(pane: PaneId): PaneId {
  return pane === 'primary' ? 'secondary' : 'primary';
}

export function normalizePaneId(pane: unknown, fallback: PaneId = 'primary'): PaneId {
  if (pane === 'primary' || pane === 'secondary') return pane;
  return fallback === 'secondary' ? 'secondary' : 'primary';
}

export function createPaneSearchState(): PaneSearchState {
  return {
    cancelled: false,
    currentSearchId: null,
    isSearching: false,
    options: null,
    query: '',
    results: [],
    savedEntries: null,
    searchMode: false,
  };
}

export function createPaneSession(overrides: Partial<PaneSession> = {}): PaneSession {
  const selectedEntries = overrides.selectedEntries instanceof Set
    ? overrides.selectedEntries
    : new Set(overrides.selectedEntries || []);
  const search = {
    ...createPaneSearchState(),
    ...(overrides.search || {}),
  };

  return {
    activeTabId: null,
    currentArchive: null,
    entries: [],
    filterOpen: false,
    filterQuery: '',
    filteredEntries: [],
    focusedIndex: -1,
    gitStatus: null,
    history: [],
    historyIndex: -1,
    isGridView: false,
    lastSelectedIndex: -1,
    path: '',
    showHiddenFiles: false,
    sortAsc: true,
    sortBy: 'name',
    tabs: [],
    typeAheadBuffer: '',
    typeAheadTimeout: null,
    ...overrides,
    search,
    selectedEntries,
  };
}

export function createPanePair(
  overrides: Partial<Record<PaneId, Partial<PaneSession>>> = {},
): PanePair {
  return {
    primary: createPaneSession(overrides.primary),
    secondary: createPaneSession(overrides.secondary),
  };
}

export function paneSession(host: PaneHost, pane: PaneId = host.activePane): PaneSession {
  return host.panes[normalizePaneId(pane, host.activePane)];
}

export function recordPaneHistory(session: PaneSession, path: PathString, mode: HistoryMode): void {
  if (mode === 'none') return;

  if (mode === 'replace-current' && session.historyIndex >= 0) {
    const nextHistory = [...session.history];
    nextHistory[session.historyIndex] = path;
    session.history = nextHistory;
    return;
  }

  if (session.history[session.historyIndex] === path) {
    return;
  }

  session.history = [...session.history.slice(0, session.historyIndex + 1), path];
  session.historyIndex = session.history.length - 1;
}

export function resetPaneSearch(session: PaneSession): void {
  session.search = createPaneSearchState();
}

export function breadcrumbSegments(path: PathString): Array<{ current: boolean; label: string; path: string }> {
  const raw = String(path || '');
  if (!raw) return [];

  const isAbsolute = raw.startsWith('/');
  const parts = raw.split('/').filter(Boolean);
  const segments: Array<{ current: boolean; label: string; path: string }> = [];

  if (isAbsolute) {
    segments.push({
      current: parts.length === 0,
      label: '/',
      path: '/',
    });
  }

  let accumulated = isAbsolute ? '' : '';
  parts.forEach((part, index) => {
    accumulated = isAbsolute || accumulated.startsWith('/')
      ? `${accumulated}/${part}`
      : (accumulated ? `${accumulated}/${part}` : part);
    const segmentPath = isAbsolute ? accumulated : accumulated;
    segments.push({
      current: index === parts.length - 1,
      label: part,
      path: segmentPath,
    });
  });

  return segments;
}

export function persistablePaneSession(session: PaneSession): PersistedPaneSession {
  return {
    activeTabId: session.activeTabId,
    history: [...(session.history || [])],
    historyIndex: session.historyIndex,
    isGridView: Boolean(session.isGridView),
    path: session.path || '',
    showHiddenFiles: Boolean(session.showHiddenFiles),
    sortAsc: session.sortAsc !== false,
    sortBy: session.sortBy || 'name',
    tabs: (session.tabs || []).map((tab) => ({
      history: [...(tab.history || [])],
      historyIndex: tab.historyIndex,
      id: tab.id,
      path: tab.path,
      title: tab.title,
    })),
  };
}

export function applyPersistedPaneSession(session: PaneSession, saved: Partial<PersistedPaneSession> | null | undefined): void {
  if (!saved || typeof saved !== 'object') return;

  if (typeof saved.path === 'string') session.path = saved.path;
  if (Array.isArray(saved.history)) session.history = [...saved.history];
  if (Number.isInteger(saved.historyIndex)) session.historyIndex = saved.historyIndex as number;
  if (typeof saved.sortBy === 'string') session.sortBy = saved.sortBy;
  if (typeof saved.sortAsc === 'boolean') session.sortAsc = saved.sortAsc;
  if (typeof saved.isGridView === 'boolean') session.isGridView = saved.isGridView;
  if (typeof saved.showHiddenFiles === 'boolean') session.showHiddenFiles = saved.showHiddenFiles;
  if (Array.isArray(saved.tabs)) {
    session.tabs = saved.tabs.map((tab) => ({
      history: Array.isArray(tab.history) ? [...tab.history] : [tab.path],
      historyIndex: Number.isInteger(tab.historyIndex) ? tab.historyIndex : 0,
      id: String(tab.id || ''),
      path: String(tab.path || ''),
      title: String(tab.title || tab.path || ''),
    })).filter((tab) => tab.id && tab.path);
  }
  if (saved.activeTabId === null || typeof saved.activeTabId === 'string') {
    session.activeTabId = saved.activeTabId;
  }
}

export function persistablePaneSessions(
  host: PaneHost & { dualPaneEnabled: boolean },
): PersistedPaneSessions {
  return {
    activePane: normalizePaneId(host.activePane),
    dualPaneEnabled: Boolean(host.dualPaneEnabled),
    primary: persistablePaneSession(host.panes.primary),
    secondary: persistablePaneSession(host.panes.secondary),
  };
}
