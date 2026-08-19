// SimpleFile - State Management Module
// Centralized application state with reactive proxy store

import { createPanePair, persistablePaneSessions, applyPersistedPaneSession, normalizePaneId, type PersistedPaneSessions } from '../paneSession';

// Monotonic counter for generating unique IDs (avoids Date.now() collisions)
let _idCounter = 0;
export function uniqueId(prefix: string) {
    return `${prefix}_${Date.now()}_${++_idCounter}`;
}

// ============================================================================
// State Store
// ============================================================================

const initialState = {
    clipboard: null,
    clipboardAction: null,
    undoStack: [],
    redoStack: [],
    homePath: '',
    activeOperations: new Map(),
    draggedItems: [],
    isDragging: false,
    treeData: new Map(),
    treeExpanded: new Set(),
    showPreviewPane: false,
    previewEntry: null,
    iconSize: 64,
    quickLookVisible: false,
    quickLookEntry: null,
    folderSizes: new Map(),
    bookmarks: [],
    recentLocations: [],
    drives: [],
    theme: 'dark',
    settingsVisible: false,
    aboutVisible: false,
    commandPaletteVisible: false,
    settings: {
        theme: 'dark',
        defaultView: 'list',
        defaultIconSize: 64,
        showHidden: false,
        useTrash: true,
        enableGitIntegration: true,
        confirmDelete: true,
        openInNewTab: false,
        autoCollapseTree: false,
        showRecentLocations: true,
        showFolderSizes: true,
        startLocation: 'home',
        customPath: '',
        /**
         * List of optional columns to display in list view.  The name column is
         * always shown; the entries in this array control additional metadata
         * columns.  Valid values: 'size', 'items', 'date', 'type'.
         */
        visibleColumns: ['size', 'date', 'type'],
        columnWidths: {
            name: 240,
            size: 100,
            items: 90,
            date: 140,
            type: 100
        }
    },
    dualPaneEnabled: false,
    activePane: 'primary',
    panes: createPanePair(),
    paneSessionsRestored: false,
    smartFolders: [],
    cleanupInProgress: false,
    tags: [],
    fileTags: {},
    isNavigating: false,
    clipboardHistory: [],
};

// Create reactive state with optional change listeners
const listeners = new Set();

function createReactiveState(initial: any) {
    let reactiveState = $state({
        ...initial,
        activeOperations: new Map(),
        treeData: new Map(),
        treeExpanded: new Set(),
        folderSizes: new Map(),
        panes: createPanePair(),
    });

    return new Proxy(reactiveState, {
        set(target, property, value) {
            const oldValue = (target as any)[property];
            (target as any)[property] = value;

            // Notify listeners of state change
            if (oldValue !== value) {
                listeners.forEach(listener => {
                    try {
                        (listener as any)(property, value, oldValue);
                    } catch (e) {
                        console.error('State listener error:', e);
                    }
                });
            }
            return true;
        }
    });
}

export const state = createReactiveState(initialState);

// ============================================================================
// State Helpers
// ============================================================================

export function subscribe(listener: any) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function resetState() {
    (Object.keys(initialState) as Array<keyof typeof initialState>).forEach(key => {
        if (key === 'panes') {
            (state as any).panes = createPanePair();
            return;
        }
        if (typeof initialState[key] === 'object' && initialState[key] !== null) {
            if (initialState[key] instanceof Map) {
                (state as any)[key] = new Map();
            } else if (initialState[key] instanceof Set) {
                (state as any)[key] = new Set();
            } else if (Array.isArray(initialState[key])) {
                (state as any)[key] = [];
            } else {
                (state as any)[key] = { ...(initialState as any)[key] };
            }
        } else {
            (state as any)[key] = initialState[key];
        }
    });
}

// ============================================================================
// Persistence
// ============================================================================

export function saveSettings() {
    try {
        localStorage.setItem('simplefile-settings', JSON.stringify(state.settings));
        localStorage.setItem('simplefile-theme', state.theme);
    } catch (e) {
        console.warn('Could not save settings:', e);
    }
}

export function loadSettings() {
    try {
        const saved = localStorage.getItem('simplefile-settings');
        if (saved) {
            state.settings = { ...state.settings, ...JSON.parse(saved) };
        }
        const theme = localStorage.getItem('simplefile-theme');
        if (theme) {
            state.theme = theme;
        }
    } catch (e) {
        console.warn('Could not load settings:', e);
    }
}

const PANE_SESSIONS_KEY = 'simplefile-pane-sessions';
const LEGACY_TABS_KEY = 'simplefile-tabs';
const LEGACY_ACTIVE_TAB_KEY = 'simplefile-active-tab';

export function saveTabs() {
    try {
        const payload = persistablePaneSessions(state);
        localStorage.setItem(PANE_SESSIONS_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('Could not save pane sessions:', e);
    }
}

export function loadTabs() {
    try {
        const savedSessions = localStorage.getItem(PANE_SESSIONS_KEY);
        if (savedSessions) {
            const parsed = JSON.parse(savedSessions) as PersistedPaneSessions;
            applyPersistedPaneSession(state.panes.primary, parsed?.primary);
            applyPersistedPaneSession(state.panes.secondary, parsed?.secondary);
            state.activePane = normalizePaneId(parsed?.activePane);
            state.dualPaneEnabled = Boolean(parsed?.dualPaneEnabled);
            state.paneSessionsRestored = Boolean(parsed?.primary?.path || parsed?.primary?.tabs?.length);
            return state.paneSessionsRestored;
        }

        const saved = localStorage.getItem(LEGACY_TABS_KEY);
        const activeId = localStorage.getItem(LEGACY_ACTIVE_TAB_KEY);
        if (saved) {
            const tabs = JSON.parse(saved);
            state.panes.primary.tabs = Array.isArray(tabs) ? tabs : [];
            state.panes.primary.activeTabId = activeId;
            state.paneSessionsRestored = state.panes.primary.tabs.length > 0;
            return state.paneSessionsRestored;
        }
    } catch (e) {
        console.warn('Could not load pane sessions:', e);
    }
    return false;
}

// ============================================================================
// Bookmarks Persistence
// ============================================================================

export function saveBookmarks() {
    try {
        localStorage.setItem('simplefile-bookmarks', JSON.stringify(state.bookmarks));
    } catch (e) {
        console.warn('Could not save bookmarks:', e);
    }
}

export function loadBookmarks() {
    try {
        const saved = localStorage.getItem('simplefile-bookmarks');
        if (saved) {
            state.bookmarks = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Could not load bookmarks:', e);
    }
}

export function addBookmark(path: string, name: string) {
    if (state.bookmarks.some((b: any) => b.path === path)) return false;

    state.bookmarks = [...state.bookmarks, {
        id: uniqueId('bm'),
        path,
        name: name || path.split(/[/\\]/).filter(Boolean).pop() || path
    }];
    saveBookmarks();
    return true;
}

export function removeBookmark(id: string) {
    const index = state.bookmarks.findIndex((b: any) => b.id === id);
    if (index > -1) {
        state.bookmarks = state.bookmarks.filter((b: any) => b.id !== id);
        saveBookmarks();
        return true;
    }
    return false;
}

// ============================================================================
// Recent Locations Persistence
// ============================================================================

const MAX_RECENT = 10;

export function saveRecentLocations() {
    try {
        localStorage.setItem('simplefile-recent', JSON.stringify(state.recentLocations));
    } catch (e) {
        console.warn('Could not save recent locations:', e);
    }
}

export function loadRecentLocations() {
    try {
        const saved = localStorage.getItem('simplefile-recent');
        if (saved) {
            state.recentLocations = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Could not load recent locations:', e);
    }
}

export function addRecentLocation(path: string) {
    // Build new array (assignment-based so the reactive proxy is triggered)
    const filtered = state.recentLocations.filter((r: any) => r.path !== path);
    const newEntry = {
        path,
        name: path.split(/[/\\]/).filter(Boolean).pop() || path,
        timestamp: Date.now()
    };
    state.recentLocations = [newEntry, ...filtered].slice(0, MAX_RECENT);

    saveRecentLocations();
}

export function clearRecentLocations() {
    state.recentLocations = [];
    saveRecentLocations();
}

// ============================================================================
// File Tags / Color Labels Persistence
// ============================================================================

export function saveFileTags() {
    try {
        localStorage.setItem('simplefile-tags', JSON.stringify(state.fileTags || {}));
    } catch (e) {
        console.warn('Could not save file tags:', e);
    }
}

export function loadFileTags() {
    try {
        const saved = localStorage.getItem('simplefile-tags');
        if (saved) {
            state.fileTags = JSON.parse(saved) || {};
        }
    } catch (e) {
        console.warn('Could not load file tags:', e);
        state.fileTags = {};
    }
}

export function setFileTag(path: string, tag: any) {
    const tags = { ...(state.fileTags || {}) };
    if (tag === null || tag === 'clear') {
        delete (tags as any)[path];
    } else {
        tags[path] = { color: tag, label: tag };
    }
    state.fileTags = tags;
    saveFileTags();
}

export function clearFileTag(path: string) {
    setFileTag(path, 'clear');
}
