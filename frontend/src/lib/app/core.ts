
import { onMount } from 'svelte';
  // @ts-ignore
  import { addBookmark, addRecentLocation, clearRecentLocations, loadBookmarks, loadRecentLocations, loadSettings, loadTabs, removeBookmark, saveSettings, saveTabs, state as appState } from './state.svelte.ts';
  // @ts-ignore
  import { resolveStartupLocation } from './startup-location.ts';
  import { getActiveFileSystem } from '../vfs';
import {
    batchRename,
    calculateFolderSize,
    cancelOperation,
    compareFiles,
    computeChecksum,
    countFolderItems,
    copyEntryResolved,
    copyWithProgress,
    createArchive,
    createDirectory,
    createFile,
    createTag,
    deleteEntry,
    deleteSmartFolder,
    diskCleanup,
    extractArchive,
    getAllFileTags,
    getAllTags,
    getEntryInfo,
    getImageMetadata,
    getGitFileStatuses,
    getHomeDir,
    listDirectory,
    listDrives,
    listSubdirectories,
    listArchive,
    loadSmartFolders,
    moveEntryResolved,
    moveWithProgress,
    moveToTrash,
    onExternalFileDrop,
    onExternalFileDropHover,
    onExternalFileDropLeave,
    onFileChange,
    onOperationProgress,
    openFile,
    openFileWith,
    openTerminal,
    readFilePreview,
    renameEntry,
    searchFiles,
    selectDirectory,
    cancelSearch,
    checkForUpdate,
    checkRarInstalled,
    getAppAboutInfo,
    getAppVersion,
    installRar,
    installUpdate,
    saveSmartFolder,
    setTagsForPath,
    watchDirectory,
    setDefaultFileManager,
    unwatchDirectory,
  } from '../api';
  import {
    basename,
    createFallbackDriveForPath,
    fileType,
    formatModified,
    formatFileSize,
    getParentPath,
    isValidFileName,
    joinPath,
    visibleEntries,
  } from '../coreFileManager';
  import { renderAdvancedSearchDialog } from '../searchDialog';
  import { getRecentSearches, rememberRecentSearch } from '../searchStorage';
  import { getOpenWithSuggestions, rememberOpenWithApplication } from '../localCommandStorage';
  import { readAdvancedSearchOptions, searchResultToFileEntry, toSearchCommandOptions, type SearchWorkflowOptions } from '../searchOptions';
  import { renderAdvancedRenamePreview } from '../components/advanced-rename-preview';
  import { renderArchiveContents, renderArchiveInfo, renderCreateArchiveBody } from '../components/archive-surfaces';
  import { clearSearchResultsHeader, renderSearchResultsHeader } from '../components/search-chrome';
  import { renderContextMenu } from '../components/context-menus';
  import { clearQuickLook, renderQuickLook } from '../components/quick-look';
    import { renderStatusBar } from '../components/status-bar';
  import { clearSettingsBody, renderSettingsBody } from '../components/settings-body';
  import { showError, showSuccess } from '../components/toasts';
            
  import { legacyOverlayMarkup } from '../components/legacy-overlays';
  import { renderLayoutShell } from '../components/layout-shell';
  import type {
    ArchiveFormat,
    ClipboardAction,
    CleanupResult,
    ConflictAction,
    FileEntry,
    NativeFileDropEventPayload,
    OperationId,
    PathString,
    ProgressUpdate,
    RenameRequest,
    SearchOptions,
    SmartFolder,
    TransferResult,
  } from '../types';

  export type ColorLabelTag = {
    color: string;
    emoji: string;
    id: number;
    name: string;
    label?: string;
  };

  export type UndoEntry = {
    undo: () => Promise<any>;
    redo?: () => Promise<any>;
    description: string;
  };

import { localState } from './localState.svelte';
import type { PaneId } from "../paneSession.js";
import {
  breadcrumbSegments,
  normalizePaneId,
  otherPaneId,
  PANE_IDS,
  paneSession,
  recordPaneHistory,
} from "../paneSession.js";
import type { TransferAction } from "../transferPathUtils.js";

import { isArchiveEntry, showArchiveContentsFlow, showCreateArchiveFlow, extractArchiveFlow, archiveExtractFolderNameForPath } from "./archive.js";
import { resetSearchStateForNavigation, showPropertiesFlow } from "./search.js";

const defaultColorLabels = [
    { color: '#ef4444', name: 'Red' },
    { color: '#f97316', name: 'Orange' },
    { color: '#eab308', name: 'Yellow' },
    { color: '#22c55e', name: 'Green' },
    { color: '#3b82f6', name: 'Blue' },
    { color: '#a855f7', name: 'Purple' }
];

  type HistoryMode = 'push' | 'replace-current' | 'none';

  export function safeTagColor(value: unknown) {
    const color = String(value || '#64748b').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(color) || /^[a-z]+$/i.test(color)) {
      return color;
    }
    return '#64748b';
  }

  export function normalizeTag(raw: any): ColorLabelTag | null {
    const id = Number(raw?.id);
    if (!Number.isFinite(id)) return null;
    const name = String(raw?.name || raw?.label || 'Label').trim() || 'Label';
    return {
      color: safeTagColor(raw?.color),
      emoji: raw?.emoji || '\u25cf',
      id,
      label: name,
      name,
    };
  }

  export function normalizeTags(rawTags: any[] = []) {
    return rawTags
      .map(normalizeTag)
      .filter((tag): tag is ColorLabelTag => Boolean(tag));
  }

  export function normalizeFileTagMap(rawTags: Record<string, any> = {}) {
    const next: Record<PathString, ColorLabelTag> = {};
    for (const [path, rawTag] of Object.entries(rawTags)) {
      const tag = normalizeTag(rawTag);
      if (tag) next[path] = tag;
    }
    return next;
  }

  export async function loadTagsFlow({ reportErrors = false } = {}) {
    try {
      const [tags, fileTags] = await Promise.all([
        getAllTags(),
        getAllFileTags(),
      ]);
      appState.tags = normalizeTags(tags);
      appState.fileTags = normalizeFileTagMap(fileTags);
    } catch (error) {
      if (reportErrors) showError(error);
      else console.warn('Failed to load file labels:', error);
    }
  }

  export async function ensureColorLabelsAvailable() {
    await loadTagsFlow();
    if (appState.tags?.length) {
      return appState.tags as ColorLabelTag[];
    }

    const created: ColorLabelTag[] = [];
    for (const label of defaultColorLabels) {
      const tag = normalizeTag(await createTag(label.name, label.color));
      if (tag) created.push(tag);
    }
    appState.tags = created;
    return created;
  }

  export function selectedFolderEntries() {
    return selectedFileEntries().filter((entry: FileEntry) => entry.is_dir);
  }

  export function itemCountLabel(count: number) {
    return `${count} item${count === 1 ? '' : 's'}`;
  }

  export function applyFolderMetrics(metrics: Map<PathString, { count: number; size: number }>) {
    const withMetrics = (entries: FileEntry[]) => entries.map((entry: FileEntry) => {
      const metric = metrics.get(entry.path);
      if (!metric) return entry;
      return {
        ...entry,
        itemCount: itemCountLabel(metric.count),
        itemCountValue: metric.count,
        size: metric.size,
      };
    });

    for (const pane of PANE_IDS) {
      const session = paneSession(appState, pane);
      session.entries = withMetrics(session.entries);
      if (session.search.savedEntries) {
        session.search.savedEntries = withMetrics(session.search.savedEntries);
      }
      applyPaneFilters(pane);
    }
  }

  export async function showFolderMetricsFlow() {
    const folders = selectedFolderEntries();
    if (folders.length === 0) {
      showError('Select one or more folders to calculate size and item count.');
      return;
    }

    try {
      const metrics = new Map<PathString, { count: number; size: number }>();
      const nextFolderSizes = new Map(appState.folderSizes || new Map());

      await runWithProgress(
        'Calculating Folder Metrics',
        folders.length === 1 ? folders[0].name : `${folders.length} folders`,
        async () => {
          for (let index = 0; index < folders.length; index += 1) {
            const folder = folders[index];
            updateProgressFlow((index / Math.max(1, folders.length)) * 90, folder.name);
            const [size, count] = await Promise.all([
              calculateFolderSize(folder.path),
              countFolderItems(folder.path),
            ]);
            const metric = { count: Number(count || 0), size: Number(size || 0) };
            metrics.set(folder.path, metric);
            nextFolderSizes.set(folder.path, metric.size);
          }
        },
      );

      appState.folderSizes = nextFolderSizes;
      applyFolderMetrics(metrics);
      showSuccess(`Calculated ${folders.length} folder${folders.length === 1 ? '' : 's'}`);
    } catch (error) {
      showError(error);
    }
  }

  export function renderTagOptions(tags: ColorLabelTag[], currentTagId: number | null) {
    const tagOptions = tags.map((tag) => `
      <label class="tag-option">
        <input type="radio" name="stage9-color-label" value="${tag.id}" ${currentTagId === tag.id ? 'checked' : ''}>
        <span class="tag-swatch" style="background-color:${escapeHtml(tag.color)}"></span>
        <span>${escapeHtml(tag.name)}</span>
      </label>
    `).join('');

    return `
      <div class="tags-selector">
        ${tagOptions}
        <label class="tag-option">
          <input type="radio" name="stage9-color-label" value="none" ${currentTagId ? '' : 'checked'}>
          <span class="tag-swatch tag-swatch--empty"></span>
          <span>None</span>
        </label>
      </div>
    `;
  }

  export async function showSetColorLabelFlow() {
    const entries = selectedFileEntries();
    if (entries.length === 0) {
      showError('Select one or more items to label.');
      return;
    }

    try {
      const tags = await ensureColorLabelsAvailable();
      if (tags.length === 0) {
        showError('No color labels are available.');
        return;
      }

      const currentTag = entries.length === 1 ? appState.fileTags?.[entries[0].path] : null;
      const currentTagId = Number.isFinite(Number(currentTag?.id)) ? Number(currentTag.id) : null;
      const result = await showHtmlDialog({
        bodyHtml: renderTagOptions(tags, currentTagId),
        confirmText: 'Apply',
        onConfirm: () => (
          document.querySelector<HTMLInputElement>('input[name="stage9-color-label"]:checked')?.value || 'none'
        ),
        title: 'Set Color Label',
      });
      if (result === false) return;

      const value = String(result || 'none');
      const selectedTag = value === 'none'
        ? null
        : tags.find((tag) => tag.id === Number(value)) || null;

      const nextFileTags = { ...(appState.fileTags || {}) };
      for (const entry of entries) {
        await setTagsForPath(entry.path, selectedTag ? [selectedTag.id] : []);
        if (selectedTag) nextFileTags[entry.path] = selectedTag;
        else delete nextFileTags[entry.path];
      }

      appState.fileTags = nextFileTags;
      applyEntryFilters();
      document.dispatchEvent(new CustomEvent('simplefile:tags-updated'));
      showSuccess(`Updated ${entries.length} label${entries.length === 1 ? '' : 's'}`);
    } catch (error) {
      showError(error);
    }
  }

  export function renderCleanupResults(result: CleanupResult, thresholdBytes: number) {
    const largeFiles = result.large_files || [];
    const duplicateGroups = result.duplicates || [];
    const largeLimit = 50;
    const duplicateLimit = 25;
    const largeRows = largeFiles.slice(0, largeLimit).map(([path, size]) => `
      <li class="cleanup-result-row">
        <span title="${escapeHtml(path)}">${escapeHtml(path)}</span>
        <strong>${escapeHtml(formatFileSize(size))}</strong>
      </li>
    `).join('');
    const duplicateRows = duplicateGroups.slice(0, duplicateLimit).map((group) => `
      <li class="cleanup-result-row cleanup-result-row--stacked">
        <strong>${escapeHtml(group.files.length)} duplicate files</strong>
        <span class="cleanup-hash">SHA-256 ${escapeHtml(group.hash.slice(0, 16))}...</span>
        <span class="cleanup-path-list">${group.files.map((path) => escapeHtml(path)).join('<br>')}</span>
      </li>
    `).join('');

    return `
      <div class="cleanup-results">
        <div class="cleanup-summary">
          <span>${largeFiles.length} large file${largeFiles.length === 1 ? '' : 's'} at or above ${escapeHtml(formatFileSize(thresholdBytes))}</span>
          <span>${duplicateGroups.length} duplicate group${duplicateGroups.length === 1 ? '' : 's'}</span>
        </div>
        <h4>Large Files</h4>
        ${largeRows
          ? `<ul class="cleanup-result-list">${largeRows}</ul>${largeFiles.length > largeLimit ? `<p class="settings-section-hint">Showing first ${largeLimit} files.</p>` : ''}`
          : '<p class="placeholder-msg">No large files matched the threshold.</p>'}
        <h4>Duplicates</h4>
        ${duplicateRows
          ? `<ul class="cleanup-result-list">${duplicateRows}</ul>${duplicateGroups.length > duplicateLimit ? `<p class="settings-section-hint">Showing first ${duplicateLimit} groups.</p>` : ''}`
          : '<p class="placeholder-msg">No duplicate files found.</p>'}
      </div>
    `;
  }

  export async function showDiskCleanupFlow() {
    const cleanupPath = pathForPane();
    if (!cleanupPath || appState.cleanupInProgress) return;

    const thresholdResult = await showHtmlDialog({
      bodyHtml: `
        <div class="form-group">
          <label class="form-label" for="cleanup-threshold-mb">Large file threshold (MB)</label>
          <input id="cleanup-threshold-mb" class="form-input input-full" type="number" min="0" step="1" value="100">
        </div>
        <p class="settings-section-hint">The scan reports candidates only. It does not delete or move files.</p>
      `,
      confirmText: 'Analyze',
      onConfirm: () => {
        const value = Number((document.getElementById('cleanup-threshold-mb') as HTMLInputElement | null)?.value || 100);
        if (!Number.isFinite(value) || value < 0) return 100 * 1024 * 1024;
        return Math.max(1, Math.round(value * 1024 * 1024));
      },
      title: 'Analyze Cleanup',
    });
    if (thresholdResult === false) return;

    const thresholdBytes = Number(thresholdResult || 100 * 1024 * 1024);
    appState.cleanupInProgress = true;
    try {
      const result = await runWithProgress(
        'Analyzing Cleanup',
        cleanupPath,
        () => diskCleanup(cleanupPath, thresholdBytes),
      );

      await showHtmlDialog({
        bodyHtml: renderCleanupResults(result, thresholdBytes),
        confirmText: 'Close',
        showCancel: false,
        title: 'Cleanup Results',
      });
    } catch (error) {
      showError(error);
    } finally {
      appState.cleanupInProgress = false;
    }
  }

  export function applyTheme() {
    document.documentElement.setAttribute('data-theme', appState.theme || 'dark');
  }

  export function applyPersistedViewSettings() {
    appState.theme = appState.settings?.theme || appState.theme || 'dark';
    appState.iconSize = Number(appState.settings?.defaultIconSize || appState.iconSize || 64);
    document.documentElement.style.setProperty('--icon-size', `${appState.iconSize}px`);
    if (!appState.paneSessionsRestored) {
      const isGrid = appState.settings?.defaultView === 'grid';
      const showHidden = Boolean(appState.settings?.showHidden);
      for (const pane of PANE_IDS) {
        const session = paneSession(appState, pane);
        session.isGridView = isGrid;
        session.showHiddenFiles = showHidden;
      }
    }
    applyTheme();
  }

  export function activePaneId(): PaneId {
    return normalizePaneId(appState.activePane);
  }

  export function activatePane(pane: PaneId) {
    if (!appState.dualPaneEnabled && pane === 'secondary') return;
    appState.activePane = pane;
    updateStatusBar();
    void updatePreviewPane();
  }

  export function sessionForPane(pane: PaneId = activePaneId()) {
    return paneSession(appState, pane);
  }

  export function entriesForPane(pane: PaneId = activePaneId()) {
    return sessionForPane(pane).entries || [];
  }

  export function filteredEntriesForPane(pane: PaneId = activePaneId()) {
    return sessionForPane(pane).filteredEntries || [];
  }

  export function selectedSetForPane(pane: PaneId = activePaneId()) {
    return sessionForPane(pane).selectedEntries || new Set<PathString>();
  }

  export function pathForPane(pane: PaneId = activePaneId()) {
    return sessionForPane(pane).path || '';
  }

  export function selectedEntriesInView(pane: PaneId = appState.activePane as PaneId) {
    const selectedSet = selectedSetForPane(pane);
    return filteredEntriesForPane(pane).filter((entry: FileEntry) => selectedSet.has(entry.path));
  }

  export function selectedSizeText() {
    const total = selectedEntriesInView()
      .filter((entry: FileEntry) => !entry.is_dir)
      .reduce((sum: number, entry: FileEntry) => sum + Number(entry.size || 0), 0);

    return total > 0 ? formatFileSize(total) : null;
  }

  export function updateStatusBar() {
    renderStatusBar(document.getElementById('status-bar'), {
      currentPath: pathForPane(),
      selectedCount: selectedSetForPane().size,
      selectedSizeText: selectedSizeText(),
      totalItems: filteredEntriesForPane().length,
    });
  }

  export function applyPaneFilters(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    session.filteredEntries = visibleEntries(session.entries, {
      filterQuery: session.filterQuery,
      showHidden: session.showHiddenFiles,
      sortAsc: session.sortAsc,
      sortBy: session.sortBy,
    });
    if (pane === activePaneId()) updateStatusBar();
  }

  export function applyEntryFilters() {
    applyPaneFilters('primary');
  }

  export function applySecondaryEntryFilters() {
    applyPaneFilters('secondary');
  }

  export function applyAllPaneFilters() {
    applyPaneFilters('primary');
    applyPaneFilters('secondary');
  }

  export function syncActiveTab(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    if (!session.path) return;

    const activeTabId = session.activeTabId || `tab-${Date.now()}`;
    const tab = {
      id: activeTabId,
      path: session.path,
      title: basename(session.path),
      history: [...session.history],
      historyIndex: session.historyIndex,
    };

    const existingIndex = session.tabs.findIndex((candidate) => candidate.id === activeTabId);
    session.tabs = existingIndex >= 0
      ? session.tabs.map((candidate) => candidate.id === activeTabId ? tab : candidate)
      : [...session.tabs, tab];
    session.activeTabId = activeTabId;
    saveTabs();
  }

  export function createTabState(path: PathString) {
    return {
      id: `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      path,
      title: basename(path),
      history: [path],
      historyIndex: 0,
    };
  }

  export async function openNewTab(path: PathString = pathForPane() || appState.homePath, pane: PaneId = activePaneId()) {
    if (!path) return;
    const session = sessionForPane(pane);
    const tab = createTabState(path);
    session.tabs = [...session.tabs, tab];
    session.activeTabId = tab.id;
    session.history = [...tab.history];
    session.historyIndex = tab.historyIndex;
    saveTabs();
    await loadPaneDirectory(pane, path, 'replace-current');
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-tab-id="${tab.id}"]`)?.focus();
    }, 0);
  }

  export async function switchToTab(tabId: string, pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    const tab = session.tabs.find((candidate: { id: string }) => candidate.id === tabId);
    if (!tab) return;
    session.activeTabId = tab.id;
    session.history = [...(tab.history || [tab.path])];
    session.historyIndex = typeof tab.historyIndex === 'number' ? tab.historyIndex : session.history.length - 1;
    await loadPaneDirectory(pane, tab.path, 'none');
  }

  export async function closeTab(tabId: string, pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    const closingIndex = session.tabs.findIndex((tab: { id: string }) => tab.id === tabId);
    if (closingIndex < 0) return;

    const remainingTabs = session.tabs.filter((tab: { id: string }) => tab.id !== tabId);
    if (remainingTabs.length === 0) {
      session.tabs = [];
      await openNewTab(appState.homePath || session.path, pane);
      return;
    }

    session.tabs = remainingTabs;
    if (session.activeTabId !== tabId) {
      saveTabs();
      return;
    }

    const nextTab = remainingTabs[Math.min(closingIndex, remainingTabs.length - 1)];
    saveTabs();
    await switchToTab(nextTab.id, pane);
  }

  export function moveTabFocus(tabId: string, direction: number, pane: PaneId = activePaneId()) {
    const tabs = sessionForPane(pane).tabs;
    const index = tabs.findIndex((tab: { id: string }) => tab.id === tabId);
    if (index < 0 || tabs.length === 0) return;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    document.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`)?.focus();
  }

  export function recordHistory(path: PathString, mode: HistoryMode, pane: PaneId = 'primary') {
    recordPaneHistory(sessionForPane(pane), path, mode);
  }

  export function recordSecondaryHistory(path: PathString, mode: HistoryMode) {
    recordPaneHistory(sessionForPane('secondary'), path, mode);
  }

  export async function updatePreviewPane() {
    const token = ++localState.previewPaneToken;
    const contentTarget = document.getElementById('preview-content');
    const infoTarget = document.getElementById('preview-info');

    if (!appState.showPreviewPane) {
      contentTarget?.replaceChildren();
      infoTarget?.replaceChildren();
      appState.previewEntry = null;
      return;
    }

    const { renderPreviewPane } = await import('../components/preview-pane.js');
    if (token !== localState.previewPaneToken || !appState.showPreviewPane) return;

    const selected = selectedEntriesInView();
    if (selected.length !== 1) {
      appState.previewEntry = null;
      renderPreviewPane(contentTarget, infoTarget, { mode: 'empty' });
      return;
    }

    const entry = selected[0];
    appState.previewEntry = entry;
    if (entry.is_dir) {
      renderPreviewPane(contentTarget, infoTarget, { entry, mode: 'folder' });
      return;
    }

    renderPreviewPane(contentTarget, infoTarget, { entry, mode: 'loading' });
    try {
      const preview = await readFilePreview(entry.path);
      if (token !== localState.previewPaneToken || !appState.showPreviewPane || appState.previewEntry?.path !== entry.path) return;
      renderPreviewPane(contentTarget, infoTarget, { entry, mode: 'preview', preview });
    } catch (error) {
      if (token !== localState.previewPaneToken || !appState.showPreviewPane || appState.previewEntry?.path !== entry.path) return;
      renderPreviewPane(contentTarget, infoTarget, {
        entry,
        error: error instanceof Error ? error.message : String(error),
        mode: 'error',
      });
    }
  }

  export async function clearPreviewPaneContent() {
    localState.previewPaneToken += 1;
    appState.previewEntry = null;
    const { clearPreviewPane } = await import('../components/preview-pane.js');
    clearPreviewPane(
      document.getElementById('preview-content'),
      document.getElementById('preview-info'),
    );
  }

  export function closePreviewPaneFlow() {
    appState.showPreviewPane = false;
    void clearPreviewPaneContent();
  }

  export function selectPanePaths(
    pane: PaneId,
    paths: PathString[],
    focusedIndex = -1,
    options: { keepAnchor?: boolean } = {},
  ) {
    const session = sessionForPane(pane);
    const anchor = session.lastSelectedIndex;
    session.selectedEntries = new Set(paths);
    session.focusedIndex = focusedIndex;
    session.lastSelectedIndex = options.keepAnchor && anchor >= 0 ? anchor : focusedIndex;
    if (appState.dualPaneEnabled || pane === 'primary') {
      appState.activePane = pane;
    }
    updateStatusBar();
    void updatePreviewPane();
  }

  export function selectPaths(paths: PathString[], focusedIndex = -1) {
    selectPanePaths('primary', paths, focusedIndex);
  }

  export function selectSecondaryPaths(paths: PathString[], focusedIndex = -1) {
    selectPanePaths('secondary', paths, focusedIndex);
  }

  export function selectAllEntries() {
    const pane = activePaneId();
    const entries = filteredEntriesForPane(pane);
    selectPanePaths(pane, entries.map((entry: FileEntry) => entry.path), entries.length - 1);
  }

  export function findEntryInPane(pane: PaneId, path: PathString) {
    const session = sessionForPane(pane);
    return session.entries.find((entry: FileEntry) => entry.path === path)
      ?? session.filteredEntries.find((entry: FileEntry) => entry.path === path)
      ?? null;
  }

  export function findEntry(path: PathString) {
    return findEntryInPane('primary', path);
  }

  export function findSecondaryEntry(path: PathString) {
    return findEntryInPane('secondary', path);
  }

  export function currentSelectionPaths(pane: PaneId = activePaneId()) {
    return [...(selectedSetForPane(pane) || new Set<PathString>())] as PathString[];
  }

  export function movePaneFocus(delta: number, extendSelection = false, pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    const entries = session.filteredEntries || [];
    if (entries.length === 0) return;

    const current = session.focusedIndex >= 0 ? session.focusedIndex : 0;
    const nextIndex = Math.max(0, Math.min(entries.length - 1, current + delta));
    const entry = entries[nextIndex];
    if (!entry) return;

    if (extendSelection && session.lastSelectedIndex >= 0) {
      const start = Math.min(session.lastSelectedIndex, nextIndex);
      const end = Math.max(session.lastSelectedIndex, nextIndex);
      selectPanePaths(
        pane,
        entries.slice(start, end + 1).map((item: FileEntry) => item.path),
        nextIndex,
        { keepAnchor: true },
      );
      return;
    }

    selectPanePaths(pane, [entry.path], nextIndex);
  }

  export function focusPaneEdge(which: 'first' | 'last', pane: PaneId = activePaneId()) {
    const entries = filteredEntriesForPane(pane);
    if (entries.length === 0) return;
    const index = which === 'first' ? 0 : entries.length - 1;
    selectPanePaths(pane, [entries[index].path], index);
  }

  export function handlePaneTypeAhead(char: string, pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    session.typeAheadBuffer = `${session.typeAheadBuffer || ''}${char.toLowerCase()}`;
    window.clearTimeout(session.typeAheadTimeout ?? undefined);
    session.typeAheadTimeout = window.setTimeout(() => {
      session.typeAheadBuffer = '';
    }, 700);
    const match = session.filteredEntries.findIndex((entry: FileEntry) =>
      String(entry.name || '').toLowerCase().startsWith(session.typeAheadBuffer),
    );
    if (match >= 0) {
      selectPanePaths(pane, [session.filteredEntries[match].path], match);
    }
  }

  export function setPaneFilterQuery(pane: PaneId, query: string) {
    const session = sessionForPane(pane);
    session.filterQuery = query;
    session.filterOpen = Boolean(query) || session.filterOpen;
    applyPaneFilters(pane);
  }

  export function openPaneFilter(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    session.filterOpen = true;
  }

  export function closePaneFilter(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    session.filterOpen = false;
    session.filterQuery = '';
    applyPaneFilters(pane);
  }

  export function togglePaneHiddenFiles(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    session.showHiddenFiles = !session.showHiddenFiles;
    applyPaneFilters(pane);
  }

  export function togglePaneView(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    session.isGridView = !session.isGridView;
  }

  export function sortPane(pane: PaneId, sortBy: string) {
    const session = sessionForPane(pane);
    if (session.sortBy === sortBy) {
      session.sortAsc = !session.sortAsc;
    } else {
      session.sortBy = sortBy;
      session.sortAsc = true;
    }
    applyPaneFilters(pane);
  }

  export function pathSegmentsFor(path: PathString) {
    return breadcrumbSegments(path);
  }

  export function closeSettingsModal() {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');

    overlay?.classList.remove('visible');
    modal?.classList.remove('settings-modal');
    body?.classList.remove('settings-body');
    if (cancelBtn) cancelBtn.style.display = '';
    if (confirmBtn) {
      confirmBtn.textContent = 'Confirm';
      confirmBtn.onclick = null;
    }
    clearSettingsBody(body);
  }

  export function resetGenericModal() {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement | null;
    const confirmBtn = document.getElementById('modal-confirm') as HTMLButtonElement | null;

    modal?.classList.remove('settings-modal');
    body?.classList.remove('settings-body');
    clearSettingsBody(body);
    body?.replaceChildren();
    if (cancelBtn) {
      cancelBtn.style.display = '';
      cancelBtn.textContent = 'Cancel';
    }
    if (confirmBtn) {
      confirmBtn.style.display = '';
      confirmBtn.textContent = 'Confirm';
      confirmBtn.onclick = null;
    }
  }

  export function showDialog({
    confirmText = 'OK',
    defaultValue = '',
    label = '',
    message = '',
    title,
    type = 'confirm',
  }: {
    confirmText?: string;
    defaultValue?: string;
    label?: string;
    message?: string;
    title: string;
    type?: 'confirm' | 'prompt';
  }) {
    const overlay = document.getElementById('modal-overlay');
    const titleElement = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement | null;
    const confirmBtn = document.getElementById('modal-confirm') as HTMLButtonElement | null;
    const closeBtn = document.getElementById('modal-close') as HTMLButtonElement | null;

    if (!overlay || !body || !confirmBtn) {
      showError(`Dialog is unavailable: ${title}`);
      return Promise.resolve(type === 'prompt' ? null : false);
    }

    resetGenericModal();
    if (titleElement) titleElement.textContent = title;
    confirmBtn.textContent = confirmText;

    let input: HTMLInputElement | null = null;
    if (message) {
      const paragraph = document.createElement('p');
      paragraph.textContent = message;
      body.appendChild(paragraph);
    }

    if (type === 'prompt') {
      const group = document.createElement('div');
      group.className = 'form-group';
      const labelElement = document.createElement('label');
      labelElement.className = 'form-label';
      labelElement.htmlFor = 'core-dialog-input';
      labelElement.textContent = label || title;
      input = document.createElement('input');
      input.id = 'core-dialog-input';
      input.className = 'form-input input-full';
      input.value = defaultValue;
      group.append(labelElement, input);
      body.appendChild(group);
    }

    const overlayElement = overlay;
    overlayElement.classList.add('visible');

    return new Promise<string | boolean | null>((resolve) => {
      function cleanup(result: string | boolean | null) {
        overlayElement.classList.remove('visible');
        document.removeEventListener('keydown', handleKeydown);
        overlayElement.removeEventListener('mousedown', handleOverlayMouseDown);
        cancelBtn?.removeEventListener('click', handleCancel);
        closeBtn?.removeEventListener('click', handleCancel);
        confirmBtn?.removeEventListener('click', handleConfirm);
        resetGenericModal();
        resolve(result);
      }

      function handleCancel() {
        cleanup(null);
      }

      function handleConfirm() {
        cleanup(type === 'prompt' ? input?.value.trim() || '' : true);
      }

      function handleOverlayMouseDown(event: MouseEvent) {
        if (event.target === overlayElement) cleanup(null);
      }

      function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') cleanup(null);
        if (event.key === 'Enter' && type === 'prompt') cleanup(input?.value.trim() || '');
      }

      document.addEventListener('keydown', handleKeydown);
      overlayElement.addEventListener('mousedown', handleOverlayMouseDown);
      cancelBtn?.addEventListener('click', handleCancel);
      closeBtn?.addEventListener('click', handleCancel);
      confirmBtn.addEventListener('click', handleConfirm);
      window.setTimeout(() => input?.focus(), 0);
    });
  }

  export function escapeHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  export function showHtmlDialog({
    bodyHtml,
    confirmText = 'OK',
    onConfirm,
    showCancel = true,
    title,
  }: {
    bodyHtml: string;
    confirmText?: string;
    onConfirm?: () => unknown;
    showCancel?: boolean;
    title: string;
  }) {
    const overlay = document.getElementById('modal-overlay');
    const titleElement = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement | null;
    const confirmBtn = document.getElementById('modal-confirm') as HTMLButtonElement | null;
    const closeBtn = document.getElementById('modal-close') as HTMLButtonElement | null;

    if (!overlay || !body || !confirmBtn) {
      return Promise.resolve(false);
    }

    resetGenericModal();
    if (titleElement) titleElement.textContent = title;
    body.innerHTML = bodyHtml;
    confirmBtn.textContent = confirmText;
    if (cancelBtn) cancelBtn.style.display = showCancel ? '' : 'none';
    overlay.classList.add('visible');

    return new Promise<unknown | false>((resolve) => {
      function cleanup(result: unknown | false) {
        overlay?.classList.remove('visible');
        document.removeEventListener('keydown', handleKeydown);
        overlay?.removeEventListener('mousedown', handleOverlayMouseDown);
        cancelBtn?.removeEventListener('click', handleCancel);
        closeBtn?.removeEventListener('click', handleCancel);
        confirmBtn?.removeEventListener('click', handleConfirm);
        resetGenericModal();
        resolve(result);
      }

      function handleCancel() {
        cleanup(false);
      }

      function handleConfirm() {
        cleanup(onConfirm ? onConfirm() : true);
      }

      function handleOverlayMouseDown(event: MouseEvent) {
        if (event.target === overlay) cleanup(false);
      }

      function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') cleanup(false);
      }

      document.addEventListener('keydown', handleKeydown);
      overlay.addEventListener('mousedown', handleOverlayMouseDown);
      cancelBtn?.addEventListener('click', handleCancel);
      closeBtn?.addEventListener('click', handleCancel);
      confirmBtn.addEventListener('click', handleConfirm);
      window.setTimeout(() => body.querySelector<HTMLElement>('input, button, select, textarea')?.focus(), 0);
    });
  }



  export function startDirectoryWatch(path: PathString) {
    void syncDirectoryWatches(path);
  }

  export async function syncDirectoryWatches(preferredPath?: PathString) {
    const nextPaths = [];
    const primaryPath = pathForPane('primary');
    const secondaryPath = pathForPane('secondary');
    if (primaryPath) nextPaths.push(primaryPath);
    if (appState.dualPaneEnabled && secondaryPath && secondaryPath !== primaryPath) {
      nextPaths.push(secondaryPath);
    }
    if (preferredPath && !nextPaths.includes(preferredPath)) {
      nextPaths.push(preferredPath);
    }

    const uniquePaths = [...new Set(nextPaths.filter(Boolean))];
    const current = localState.watchedDirectoryPaths || [];
    const unchanged = uniquePaths.length === current.length
      && uniquePaths.every((path) => current.includes(path));
    if (unchanged) return;

    try {
      await unwatchDirectory();
    } catch {
      // Watcher may already be idle.
    }
    localState.watchedDirectoryPaths = [];
    localState.watchedDirectoryPath = uniquePaths[0] || null;

    for (const path of uniquePaths) {
      try {
        await watchDirectory(path);
        localState.watchedDirectoryPaths = [...localState.watchedDirectoryPaths, path];
      } catch (error) {
        console.warn('Directory watch unavailable:', error);
      }
    }
  }

  export function scheduleFileChangeRefresh(path: PathString) {
    const touchesPrimary = pathForPane('primary') && pathContains(pathForPane('primary'), path);
    const touchesSecondary = pathForPane('secondary') && pathContains(pathForPane('secondary'), path);
    if (!touchesPrimary && !touchesSecondary) return;

    if (localState.fileChangeRefreshTimer !== null) {
      window.clearTimeout(localState.fileChangeRefreshTimer);
    }

    localState.fileChangeRefreshTimer = window.setTimeout(() => {
      localState.fileChangeRefreshTimer = null;
      if (touchesPrimary) void refreshPane('primary');
      if (touchesSecondary) void refreshPane('secondary');
    }, 250);
  }

  export async function loadPaneDirectory(
    pane: PaneId,
    path: string,
    historyMode: HistoryMode = 'push',
    options: { activate?: boolean } = {},
  ) {
    if (!path) return;
    const targetPane = normalizePaneId(pane);
    const activate = options.activate !== false;
    const token = ++localState.navigationTokens[targetPane];
    localState.navigationToken += 1;
    const session = sessionForPane(targetPane);

    try {
      if (activate) appState.activePane = targetPane;
      appState.isNavigating = true;
      resetSearchStateForNavigation(targetPane);
      session.path = path;
      session.entries = [];
      session.filteredEntries = [];
      const listing = await getActiveFileSystem().listDirectory(path);
      if (token !== localState.navigationTokens[targetPane]) return;

      let entries = listing.entries;
      if (appState.settings?.enableGitIntegration) {
        try {
          const statuses = await getGitFileStatuses(listing.path);
          entries = listing.entries.map((entry: FileEntry) => (
            statuses[entry.name] ? { ...entry, git_status: statuses[entry.name] } : entry
          ));
        } catch {
          // Not a git repo, or git is unavailable.
        }
      }

      session.path = listing.path;
      session.entries = entries;
      session.selectedEntries = new Set();
      session.focusedIndex = -1;
      session.lastSelectedIndex = -1;
      session.filterQuery = '';
      session.filterOpen = false;
      recordPaneHistory(session, listing.path, historyMode);
      applyPaneFilters(targetPane);
      void syncDirectoryWatches(listing.path);
      addRecentLocation(listing.path);
      syncActiveTab(targetPane);
      if (targetPane === activePaneId()) void updatePreviewPane();
    } catch (e) {
      showError(e);
      console.error('Failed to load directory:', e);
    } finally {
      if (token === localState.navigationTokens[targetPane]) {
        appState.isNavigating = false;
      }
    }
  }

  export async function loadDirectory(path: string, historyMode: HistoryMode = 'push') {
    await loadPaneDirectory(activePaneId(), path, historyMode);
  }

  export async function loadSecondaryDirectory(path: PathString, historyMode: HistoryMode = 'push', activate = true) {
    await loadPaneDirectory('secondary', path, historyMode, { activate });
  }

  export async function refreshPane(pane: PaneId) {
    const session = sessionForPane(pane);
    if (!session.path) return;
    const selectedPaths = new Set(session.selectedEntries || new Set<PathString>());
    await loadPaneDirectory(pane, session.path, 'none', { activate: false });
    const visiblePaths = new Set(session.filteredEntries.map((entry: FileEntry) => entry.path));
    session.selectedEntries = new Set([...selectedPaths].filter((itemPath) => visiblePaths.has(itemPath)));
  }

  export async function refreshCurrentDirectory() {
    await refreshPane(activePaneId());
  }

  export async function refreshSecondaryPane() {
    await refreshPane('secondary');
  }

  export async function navigatePaneHistory(pane: PaneId, delta: number) {
    const session = sessionForPane(pane);
    const nextIndex = session.historyIndex + delta;
    if (nextIndex < 0 || nextIndex >= session.history.length) return;
    session.historyIndex = nextIndex;
    await loadPaneDirectory(pane, session.history[nextIndex], 'none');
  }

  export async function navigateSecondaryHistory(delta: number) {
    await navigatePaneHistory('secondary', delta);
  }

  export async function refreshTransferSurfaces() {
    await refreshPane('primary');
    if (appState.dualPaneEnabled && pathForPane('secondary')) {
      await refreshPane('secondary');
    }
  }

  export async function toggleDualPane() {
    appState.dualPaneEnabled = !appState.dualPaneEnabled;
    if (appState.dualPaneEnabled) {
      const secondary = sessionForPane('secondary');
      if (!secondary.path) {
        const sourcePath = pathForPane('primary') || appState.homePath;
        if (sourcePath) await loadPaneDirectory('secondary', sourcePath, 'replace-current', { activate: false });
      }
      appState.activePane = 'primary';
    } else {
      appState.activePane = 'primary';
    }
    saveTabs();
    void syncDirectoryWatches();
    updateStatusBar();
  }

  export function getUndoStack(): UndoEntry[] {
    return appState.undoStack || [];
  }

  export function getRedoStack(): UndoEntry[] {
    return (appState.redoStack || []).filter((entry: UndoEntry) => typeof entry.redo === 'function');
  }

  export function pushUndoEntry(entry: UndoEntry) {
    appState.undoStack = [entry, ...getUndoStack()].slice(0, localState.MAX_UNDO_STACK);
    appState.redoStack = [];
  }

  export async function undoLastFlow() {
    const [entry, ...rest] = getUndoStack();
    if (!entry) return;

    try {
      appState.undoStack = rest;
      await entry.undo();
      appState.redoStack = entry.redo
        ? [entry, ...getRedoStack()].slice(0, localState.MAX_UNDO_STACK)
        : getRedoStack();
      await refreshTransferSurfaces();
      showSuccess(`Undid ${entry.description}`);
    } catch (error) {
      appState.undoStack = [entry, ...rest].slice(0, localState.MAX_UNDO_STACK);
      showError(error);
    }
  }

  export async function redoLastFlow() {
    const [entry, ...rest] = getRedoStack();
    if (!entry?.redo) return;

    try {
      appState.redoStack = rest;
      await entry.redo();
      appState.undoStack = [entry, ...getUndoStack()].slice(0, localState.MAX_UNDO_STACK);
      await refreshTransferSurfaces();
      showSuccess(`Redid ${entry.description}`);
    } catch (error) {
      appState.redoStack = [entry, ...rest].slice(0, localState.MAX_UNDO_STACK);
      showError(error);
    }
  }

  export async function navigateHistory(delta: number, pane: PaneId = activePaneId()) {
    await navigatePaneHistory(pane, delta);
    syncActiveTab(pane);
  }

  export async function navigateSpecial(command: string, pane: PaneId = activePaneId()) {
    if (command === 'navigateHome') {
      await loadPaneDirectory(pane, appState.homePath);
      return;
    }

    const xdgKey = command.replace('navigate', '').toLowerCase();
    if (appState.xdgDirs && typeof appState.xdgDirs[xdgKey] === 'string') {
      await loadPaneDirectory(pane, appState.xdgDirs[xdgKey]);
      return;
    }

    const specialFolders: Record<string, string> = {
      navigateDesktop: 'Desktop',
      navigateDocuments: 'Documents',
      navigateDownloads: 'Downloads',
      navigatePictures: 'Pictures',
    };

    const folder = specialFolders[command];
    if (folder) {
      await loadPaneDirectory(pane, joinPath(appState.homePath, folder));
    }
  }

  export function normalizeComparablePath(path: PathString) {
    return String(path || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }

  export function pathsEqual(a: PathString, b: PathString) {
    return normalizeComparablePath(a) === normalizeComparablePath(b);
  }

  export function pathContains(parent: PathString, child: PathString) {
    const parentPath = normalizeComparablePath(parent);
    const childPath = normalizeComparablePath(child);
    if (!parentPath || !childPath) return false;
    if (parentPath === childPath) return true;
    return childPath.startsWith(parentPath.endsWith('/') ? parentPath : `${parentPath}/`);
  }

  export function transferVerb(action: TransferAction) {
    return action === 'move' ? 'Moved' : 'Copied';
  }

  export function transferProgressTitle(action: TransferAction) {
    return action === 'move' ? 'Moving Items' : 'Copying Items';
  }

  export async function destinationConflicts(sources: PathString[], destination: PathString) {
    try {
      const listing = await listDirectory(destination);
      const names = new Set((listing.entries || []).map((entry: FileEntry) => entry.name.toLowerCase()));
      return sources.filter((source) => names.has(basename(source).toLowerCase()));
    } catch {
      return [];
    }
  }

  export async function chooseConflictAction(
    sources: PathString[],
    destination: PathString,
    action: TransferAction,
  ): Promise<ConflictAction | null> {
    const conflicts = await destinationConflicts(sources, destination);
    if (conflicts.length === 0) return 'error';

    const rows = conflicts.slice(0, 8).map((path) => `
      <li title="${escapeHtml(path)}">${escapeHtml(basename(path))}</li>
    `).join('');
    const extra = conflicts.length > 8
      ? `<p class="settings-section-hint">And ${conflicts.length - 8} more item${conflicts.length - 8 === 1 ? '' : 's'}.</p>`
      : '';

    const result = await showHtmlDialog({
      bodyHtml: `
        <div class="transfer-conflict-dialog">
          <p>The destination already contains item${conflicts.length === 1 ? '' : 's'} with the same name.</p>
          <ul class="transfer-conflict-list">${rows}</ul>
          ${extra}
          <div class="transfer-conflict-options" role="radiogroup" aria-label="Conflict action">
            <label class="tag-option">
              <input type="radio" name="transfer-conflict-action" value="rename" checked>
              <span>Keep both</span>
            </label>
            <label class="tag-option">
              <input type="radio" name="transfer-conflict-action" value="replace">
              <span>Replace destination</span>
            </label>
            <label class="tag-option">
              <input type="radio" name="transfer-conflict-action" value="skip">
              <span>Skip conflicts</span>
            </label>
          </div>
        </div>
      `,
      confirmText: action === 'move' ? 'Move' : 'Copy',
      onConfirm: () => (
        document.querySelector<HTMLInputElement>('input[name="transfer-conflict-action"]:checked')?.value || 'rename'
      ),
      title: `${action === 'move' ? 'Move' : 'Copy'} Conflicts`,
    });

    if (result === false) return null;
    return String(result || 'rename') as ConflictAction;
  }

  export function normalizeTransferResults(result: unknown, sources: PathString[]) {
    if (!Array.isArray(result)) return [];
    return result
      .filter((item): item is TransferResult => Boolean(item?.source && item?.destination))
      .filter((item) => !String(item.destination).startsWith('SKIPPED:'))
      .map((item, index) => ({
        source: item.source || sources[index],
        destination: item.destination,
      }));
  }

  export async function runTransferCommand(
    sources: PathString[],
    destination: PathString,
    action: TransferAction,
    conflictAction: ConflictAction,
    operationId: OperationId | null = null,
  ) {
    const result = action === 'copy'
      ? await copyWithProgress(sources, destination, operationId, conflictAction)
      : await moveWithProgress(sources, destination, operationId, conflictAction);
    return normalizeTransferResults(result, sources);
  }

  export async function safeDeletePaths(paths: PathString[]) {
    if (paths.length === 0) return;
    try {
      await moveToTrash(paths);
    } catch (error) {
      if (typeof error !== 'string' || !error.startsWith('TRASH_UNAVAILABLE')) {
        throw error;
      }
      for (const path of paths) await deleteEntry(path);
    }
  }

  export function addCopyUndo(transferred: TransferResult[], destination: PathString, description: string) {
    if (transferred.length === 0) return;
    pushUndoEntry({
      description,
      undo: () => safeDeletePaths(transferred.map((item) => item.destination)),
      redo: async () => {
        for (const item of transferred) {
          try {
            await getActiveFileSystem().copyEntry(item.source, destination, 'rename');
          } catch (e) {
            console.error('Failed to redo paste:', e);
          }
        }
      },
    });
  }

  export function addMoveUndo(transferred: TransferResult[], destination: PathString, description: string) {
    if (transferred.length === 0) return;
    pushUndoEntry({
      description,
      undo: async () => {
        for (const item of [...transferred].reverse()) {
          const sourceParent = getParentPath(item.source);
          if (sourceParent) await getActiveFileSystem().moveEntry(item.destination, sourceParent, 'rename');
        }
      },
      redo: async () => {
        for (const item of transferred) {
          await getActiveFileSystem().moveEntry(item.source, destination, 'rename');
        }
      },
    });
  }

  export async function transferEntriesWithSafety(
    rawSources: PathString[],
    destination: PathString,
    action: TransferAction,
    options: { pushUndo?: boolean; showSuccess?: boolean; successMessage?: string } = {},
  ) {
    const sources = rawSources.filter((source) => {
      const sourceParent = getParentPath(source);
      return (
        source
        && destination
        && !pathsEqual(source, destination)
        && !(action === 'move' && sourceParent && pathsEqual(sourceParent, destination))
        && !(action === 'move' && pathContains(source, destination))
      );
    });
    if (sources.length === 0 || !destination) return [];

    const conflictAction = await chooseConflictAction(sources, destination, action);
    if (conflictAction === null) return [];

    const operationId = uniqueId(action === 'move' ? 'file-move' : 'file-copy');
    const label = sources.length === 1 ? basename(sources[0]) : `${sources.length} items`;
    showProgressFlow(transferProgressTitle(action), label, 0, operationId);

    try {
      const transferred = await runTransferCommand(sources, destination, action, conflictAction, operationId);
      updateProgressFlow(100, label);

      if (options.pushUndo !== false && transferred.length > 0) {
        const description = `${action === 'move' ? 'Move' : 'Copy'} ${transferred.length} item${transferred.length === 1 ? '' : 's'}`;
        if (action === 'copy') addCopyUndo(transferred, destination, description);
        else addMoveUndo(transferred, destination, description);
      }

      await refreshTransferSurfaces();
      if (options.showSuccess !== false && transferred.length > 0) {
        showSuccess(options.successMessage || `${transferVerb(action)} ${transferred.length} item${transferred.length === 1 ? '' : 's'}`);
      }
      return transferred;
    } finally {
      window.setTimeout(() => {
        if (localState.currentProgressOperationId === operationId) hideProgressFlow();
      }, 220);
    }
  }

  export async function createFolderFlow() {
    const result = await showDialog({
      confirmText: 'Create',
      defaultValue: 'New Folder',
      label: 'Folder name',
      title: 'New Folder',
      type: 'prompt',
    });
    const name = typeof result === 'string' ? result : '';
    if (!name) return;
    if (!isValidFileName(name)) {
      showError('Enter a valid folder name.');
      return;
    }

    try {
      const activePane = activePaneId();
      const parentPathAtCreation = pathForPane(activePane);
      const newPath = await getActiveFileSystem().createDirectory(parentPathAtCreation, name);
      pushUndoEntry({
        description: `Create folder ${name}`,
        undo: () => safeDeletePaths([newPath]),
        redo: () => getActiveFileSystem().createDirectory(parentPathAtCreation, name),
      });
      showSuccess(`Created folder "${name}"`);
      await refreshPane(activePane);
      const index = filteredEntriesForPane(activePane).findIndex((entry: FileEntry) => entry.path === newPath);
      selectPanePaths(activePane, [newPath], index);
    } catch (error) {
      showError(error);
    }
  }

  export async function createFileFlow() {
    const result = await showDialog({
      confirmText: 'Create',
      defaultValue: 'New File.txt',
      label: 'File name',
      title: 'New File',
      type: 'prompt',
    });
    const name = typeof result === 'string' ? result : '';
    if (!name) return;
    if (!isValidFileName(name)) {
      showError('Enter a valid file name.');
      return;
    }

    try {
      const activePane = activePaneId();
      const parentPathAtCreation = pathForPane(activePane);
      const newPath = await getActiveFileSystem().createFile(parentPathAtCreation, name);
      pushUndoEntry({
        description: `Create file ${name}`,
        undo: () => safeDeletePaths([newPath]),
        redo: () => getActiveFileSystem().createFile(parentPathAtCreation, name),
      });
      showSuccess(`Created file "${name}"`);
      await refreshPane(activePane);
      const index = filteredEntriesForPane(activePane).findIndex((entry: FileEntry) => entry.path === newPath);
      selectPanePaths(activePane, [newPath], index);
    } catch (error) {
      showError(error);
    }
  }

  export async function renameSelectedFlow() {
    const activePane = activePaneId();
    if (selectedSetForPane(activePane).size !== 1) return;
    const path = currentSelectionPaths()[0];
    const entry = findEntryInPane(activePane, path);
    if (!entry) return;

    const result = await showDialog({
      confirmText: 'Rename',
      defaultValue: entry.name,
      label: 'New name',
      title: 'Rename',
      type: 'prompt',
    });
    const newName = typeof result === 'string' ? result : '';
    if (!newName || newName === entry.name) return;
    if (!isValidFileName(newName)) {
      showError('Enter a valid name.');
      return;
    }

    try {
      const newPath = await getActiveFileSystem().renameEntry(path, newName);
      pushUndoEntry({
        description: `Rename ${entry.name}`,
        undo: () => getActiveFileSystem().renameEntry(newPath, entry.name),
        redo: () => getActiveFileSystem().renameEntry(path, newName),
      });
      showSuccess(`Renamed to "${newName}"`);
      await refreshPane(activePane);
      const index = filteredEntriesForPane(activePane).findIndex((candidate: FileEntry) => candidate.path === newPath);
      selectPanePaths(activePane, [newPath], index);
    } catch (error) {
      showError(error);
    }
  }

  export async function deleteSelectedFlow() {
    const activePane = activePaneId();
    const paths = currentSelectionPaths();
    if (paths.length === 0) return;

    const useTrash = appState.settings?.useTrash !== false;
    const confirmed = await showDialog({
      confirmText: useTrash ? 'Move to Trash' : 'Delete',
      message: useTrash
        ? `Move ${paths.length} selected item${paths.length === 1 ? '' : 's'} to trash?`
        : `Permanently delete ${paths.length} selected item${paths.length === 1 ? '' : 's'}?`,
      title: 'Delete Items',
    });
    if (!confirmed) return;

    try {
      if (useTrash) {
        await getActiveFileSystem().moveToTrash(paths);
      } else {
        const label = 'File(s)';
        const message = `Are you sure you want to permanently delete the selected ${label}?`;
        const result = await showDialog({ title: 'Confirm Permanent Delete', message, confirmText: 'Delete' });
        if (!result) return;
        for (const path of paths) await getActiveFileSystem().deleteEntry(path);
        updateProgressFlow(100, `Deleted ${paths.length} items`);
        hideProgressFlow();
      }
      showSuccess(`Deleted ${paths.length} item${paths.length === 1 ? '' : 's'}`);
      await refreshPane(activePane);
    } catch (error) {
      if (typeof error === 'string' && error.startsWith('TRASH_UNAVAILABLE')) {
        try {
          const label = 'File(s)';
          const message = `Are you sure you want to permanently delete the selected ${label}?`;
          const result = await showDialog({ title: 'Confirm Permanent Delete', message, confirmText: 'Delete' });
          if (!result) return;
          for (const path of paths) await getActiveFileSystem().deleteEntry(path);
          updateProgressFlow(100, `Deleted ${paths.length} items`);
          hideProgressFlow();
          await refreshPane(activePane);
        } catch (deleteError) {
          showError(deleteError);
        }
        return;
      }
      showError(error);
    }
  }

  export function copySelection(action: 'copy' | 'cut') {
    const paths = currentSelectionPaths();
    if (paths.length === 0) return;
    appState.clipboard = paths;
    appState.clipboardAction = action;
    appState.clipboardHistory = [{ paths, action }, ...(appState.clipboardHistory || [])].slice(0, 10);
    showSuccess(`${action === 'copy' ? 'Copied' : 'Cut'} ${paths.length} item${paths.length === 1 ? '' : 's'}`);
  }

  export async function showClipboardHistoryFlow() {
    const history = appState.clipboardHistory || [];
    const bodyHtml = history.length === 0
      ? '<p class="placeholder-msg">Clipboard history is empty.</p>'
      : `<div class="clipboard-history-list" role="radiogroup" aria-label="Clipboard history">
          ${history.map((entry: { action: ClipboardAction; paths: PathString[] }, index: number) => {
            const label = entry.paths.length === 1 ? basename(entry.paths[0]) : `${entry.paths.length} items`;
            return `
              <label class="clipboard-history-item" role="radio">
                <input type="radio" name="clipboard-history-entry" value="${index}" ${index === 0 ? 'checked' : ''}>
                <span class="clipboard-history-icon" aria-hidden="true">${entry.action === 'cut' ? '&#9986;' : '&#128203;'}</span>
                <span class="clipboard-history-label" title="${escapeHtml(entry.paths.join('\n'))}">${escapeHtml(label)}</span>
                <span class="clipboard-history-action">${escapeHtml(entry.action)}</span>
              </label>
            `;
          }).join('')}
        </div>`;

    const result = await showHtmlDialog({
      bodyHtml,
      confirmText: history.length === 0 ? 'Close' : 'Restore',
      onConfirm: () => (
        document.querySelector<HTMLInputElement>('input[name="clipboard-history-entry"]:checked')?.value || '0'
      ),
      showCancel: history.length > 0,
      title: 'Clipboard History',
    });

    if (result === false || history.length === 0) return;
    const index = Number(result || 0);
    const entry = history[index];
    if (!entry) return;
    appState.clipboard = [...entry.paths];
    appState.clipboardAction = entry.action;
    showSuccess(`Restored ${entry.action} clipboard item${entry.paths.length === 1 ? '' : 's'}`);
  }

  export async function pasteClipboard() {
    const paths = appState.clipboard || [];
    if (!paths.length || !appState.clipboardAction) return;

    try {
      const activePane = activePaneId();
      const action: TransferAction = appState.clipboardAction === 'copy' ? 'copy' : 'move';
      const pasted = await transferEntriesWithSafety(paths, pathForPane(activePane), action);
      if (appState.clipboardAction === 'cut') {
        appState.clipboard = null;
        appState.clipboardAction = null;
      }
      const pastedPaths = pasted.map((item) => item.destination);
      selectPanePaths(
        activePane,
        pastedPaths.filter((path) => entriesForPane(activePane).some((entry: FileEntry) => entry.path === path)),
      );
    } catch (error) {
      showError(error);
    }
  }

  export async function openEntryPath(path: PathString, isDirectory?: boolean, pane: PaneId = activePaneId()) {
    const entry = findEntryInPane(pane, path);
    let shouldNavigate = isDirectory ?? entry?.is_dir;

    // When neither the caller nor the local entries list knows the type,
    // ask the backend instead of guessing.  This covers edge cases such as
    // stale entry lists or paths that arrive from external sources.
    if (shouldNavigate === undefined) {
      try {
        const info = await getActiveFileSystem().getEntryInfo(path);
        shouldNavigate = info.is_dir;
      } catch {
        shouldNavigate = false;
      }
    }

    if (shouldNavigate) {
      await loadPaneDirectory(pane, path);
      return;
    }

    if (isArchiveEntry(entry)) {
      await showArchiveContentsFlow(entry);
      return;
    }

    try {
      await getActiveFileSystem().openFile(path);
    } catch (error) {
      showError(error);
    }
  }

  export async function openSelected() {
    if (selectedSetForPane().size !== 1) return;
    const path = currentSelectionPaths()[0];
    const pane = activePaneId();
    const entry = findEntryInPane(pane, path);
    await openEntryPath(path, entry?.is_dir, pane);
  }

  export async function loadTreeChildren(path: PathString) {
    const children = await getActiveFileSystem().listSubdirectories(path);
    const nextTreeData = new Map(appState.treeData);
    nextTreeData.set(path, children);
    appState.treeData = nextTreeData;
  }

  export function hideContextMenu() {
    document.getElementById('context-menu')?.classList.remove('visible');
  }

  export function showContextMenuAt(x: number, y: number) {
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    menu.classList.add('visible');
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  export function selectedFileEntries() {
    const seen = new Set<PathString>();
    const pane = activePaneId();
    const selectedSet = selectedSetForPane(pane);
    return [
      ...selectedEntriesInView(pane),
      ...entriesForPane(pane).filter((entry: FileEntry) => selectedSet.has(entry.path)),
    ].filter((entry: FileEntry) => {
      if (seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    });
  }

  export function singleSelectedEntry() {
    const entries = selectedFileEntries();
    return entries.length === 1 ? entries[0] : null;
  }



  export function overlayById(id: string) {
    return document.getElementById(id) as HTMLElement | null;
  }

  export function setOverlayVisible(id: string, visible: boolean) {
    overlayById(id)?.classList.toggle('visible', visible);
  }

  export function showProgressFlow(title: string, item = '', percent = 0, operationId: string | null = null) {
    localState.currentProgressOperationId = operationId;
    setElementText('progress-title', title);
    setElementText('progress-text', `${Math.max(0, Math.min(100, Math.round(percent)))}%`);
    setElementText('progress-item', item);
    const fill = document.getElementById('progress-bar-fill') as HTMLElement | null;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    setOverlayVisible('progress-overlay', true);
  }

  export function updateProgressFlow(percent: number, item = '') {
    setElementText('progress-text', `${Math.max(0, Math.min(100, Math.round(percent)))}%`);
    if (item) setElementText('progress-item', item);
    const fill = document.getElementById('progress-bar-fill') as HTMLElement | null;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  export function hideProgressFlow() {
    localState.currentProgressOperationId = null;
    setOverlayVisible('progress-overlay', false);
  }

  export async function runWithProgress<T>(title: string, item: string, work: () => Promise<T>) {
    showProgressFlow(title, item, 8);
    try {
      const result = await work();
      updateProgressFlow(100, item);
      return result;
    } finally {
      window.setTimeout(hideProgressFlow, 180);
    }
  }

  export function uniqueId(prefix = 'op'): OperationId {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  export function elementById<T extends HTMLElement = HTMLElement>(id: string) {
    return document.getElementById(id) as T | null;
  }

  export function inputValue(id: string, fallback = '') {
    return elementById<HTMLInputElement>(id)?.value ?? fallback;
  }

  export function setElementDisabledById(id: string, disabled: boolean) {
    const button = elementById<HTMLButtonElement>(id);
    if (button) button.disabled = disabled;
  }



  export function closeQuickLookFlow() {
    const overlay = overlayById('quicklook-overlay');
    clearQuickLook(overlay);
    overlay?.classList.remove('visible');
    localState.currentQuickLookPath = null;
  }

  export async function showQuickLookFlow() {
    const entry = singleSelectedEntry();
    if (!entry) {
      showError('Select one item to preview.');
      return;
    }

    const overlay = overlayById('quicklook-overlay');
    if (!overlay) {
      showError('Quick Look overlay is unavailable.');
      return;
    }

    const quickLookPath = entry.path;
    localState.currentQuickLookPath = quickLookPath;
    try {
      const preview = entry.is_dir ? null : await getActiveFileSystem().readFilePreview(entry.path, 2_000_000);
      if (localState.currentQuickLookPath !== quickLookPath) return;
      renderQuickLook(overlay, {
        preview,
        title: entry.name,
      });
      overlay.classList.add('visible');
      setElementText('quicklook-info', `${fileType(entry)} - ${formatFileSize(entry.size, entry.is_dir) || 'Folder'}`);
      overlay.querySelector<HTMLElement>('#quicklook-close')?.focus();
    } catch (error) {
      if (localState.currentQuickLookPath === quickLookPath) localState.currentQuickLookPath = null;
      showError(error);
    }
  }



  export async function openWithFlow() {
    const entry = singleSelectedEntry();
    if (!entry || entry.is_dir) {
      showError('Select one file to open with another application.');
      return;
    }

    const suggestions = getOpenWithSuggestions(appState, window.localStorage);
    const datalistOptions = suggestions
      .map((application) => `<option value="${escapeHtml(application)}"></option>`)
      .join('');
    const recentHint = suggestions.length > 0
      ? '<p class="settings-section-hint">Recent and common applications are available in the suggestions list.</p>'
      : '';
    const result = await showHtmlDialog({
      bodyHtml: `
        <p class="mb-md">Choose an application to open <strong>${escapeHtml(entry.name)}</strong>.</p>
        ${recentHint}
        <input
          type="text"
          id="open-with-app-input"
          list="open-with-apps"
          class="input-full"
          placeholder="Application name or executable path"
          autocomplete="off"
        >
        <datalist id="open-with-apps">${datalistOptions}</datalist>
      `,
      confirmText: 'Open',
      onConfirm: () => (document.getElementById('open-with-app-input') as HTMLInputElement | null)?.value?.trim() || '',
      title: 'Open With',
    });
    const application = typeof result === 'string' ? result.trim() : '';
    if (!application) return;

    try {
      await getActiveFileSystem().openFileWith(entry.path, application);
      rememberOpenWithApplication(window.localStorage, application);
      showSuccess(`Opening ${entry.name} with ${application}`);
    } catch (error) {
      showError(error);
    }
  }

  export async function compareSelectedFilesFlow() {
    const selectedEntries = selectedFileEntries().filter((entry: FileEntry) => !entry.is_dir);
    if (selectedEntries.length !== 2) {
      showError('Select exactly two files to compare.');
      return;
    }

    try {
      const comparison = await getActiveFileSystem().compareFiles(selectedEntries[0].path, selectedEntries[1].path);
      const rows = comparison.rows.slice(0, 200).map((row: any) => `
        <tr class="diff-row diff-${escapeHtml(row.kind)}">
          <td>${row.left_line ?? ''}</td>
          <td>${escapeHtml(row.left_text ?? '')}</td>
          <td>${row.right_line ?? ''}</td>
          <td>${escapeHtml(row.right_text ?? '')}</td>
        </tr>
      `).join('');
      await showHtmlDialog({
        bodyHtml: `
          <div class="comparison-summary">
            <p><strong>${escapeHtml(comparison.left_name)}</strong> and <strong>${escapeHtml(comparison.right_name)}</strong> are ${comparison.identical ? 'identical' : 'different'}.</p>
            <p>${comparison.added} added, ${comparison.removed} removed, ${comparison.changed} changed.</p>
            ${comparison.rows.length > 200 ? `<p>Showing first 200 of ${comparison.rows.length} comparison rows.</p>` : ''}
          </div>
          <div class="comparison-table-wrap">
            <table class="comparison-table">
              <thead>
                <tr>
                  <th>Left</th>
                  <th>${escapeHtml(comparison.left_name)}</th>
                  <th>Right</th>
                  <th>${escapeHtml(comparison.right_name)}</th>
                </tr>
              </thead>
              <tbody>${rows || '<tr><td colspan="4">No text differences to display.</td></tr>'}</tbody>
            </table>
          </div>
        `,
        confirmText: 'Close',
        showCancel: false,
        title: 'Compare Files',
      });
    } catch (error) {
      showError(error);
    }
  }

  export async function copyOrMoveToOtherPane(action: 'copy' | 'move') {
    if (!appState.dualPaneEnabled || !pathForPane(otherPaneId(activePaneId()))) {
      showError('Turn on Dual Pane and choose a destination pane first.');
      return;
    }

    const selectedEntries = selectedFileEntries();
    if (selectedEntries.length === 0) return;
    const destination = pathForPane(otherPaneId(activePaneId()));

    try {
      await transferEntriesWithSafety(
        selectedEntries.map((entry: FileEntry) => entry.path),
        destination,
        action,
        { successMessage: action === 'copy' ? 'Copied to other pane' : 'Moved to other pane' },
      );
    } catch (error) {
      showError(error);
    }
  }

  export async function packIntoFolderFlow() {
    const selectedEntries = selectedFileEntries();
    if (selectedEntries.length === 0) return;
    const result = await showDialog({
      confirmText: 'Pack',
      defaultValue: 'Packed Items',
      label: 'Folder name',
      title: 'Pack into Folder',
      type: 'prompt',
    });
    const folderName = typeof result === 'string' ? result.trim() : '';
    if (!folderName) return;
    if (!isValidFileName(folderName)) {
      showError('Enter a valid folder name.');
      return;
    }

    try {
      const activePane = activePaneId();
      const sourceParentPath = pathForPane(activePane);
      const folderPath = await getActiveFileSystem().createDirectory(sourceParentPath, folderName);
      const transferred = await transferEntriesWithSafety(
        selectedEntries.map((entry: FileEntry) => entry.path),
        folderPath,
        'move',
        { pushUndo: false, showSuccess: false },
      );
      if (transferred.length === 0) {
        await safeDeletePaths([folderPath]);
        return;
      }
      pushUndoEntry({
        description: `Pack ${selectedEntries.length} item${selectedEntries.length === 1 ? '' : 's'}`,
        undo: async () => {
          const listing = await getActiveFileSystem().listDirectory(folderPath);
          for (const child of listing.entries) {
            await getActiveFileSystem().moveEntry(child.path, sourceParentPath, 'rename');
          }
          await getActiveFileSystem().deleteEntry(folderPath);
        },
        redo: async () => {
          const redoFolderPath = await getActiveFileSystem().createDirectory(sourceParentPath, folderName);
          for (const entry of selectedEntries) {
            await getActiveFileSystem().moveEntry(entry.path, redoFolderPath, 'rename');
          }
        },
      });
      showSuccess(`Packed ${selectedEntries.length} item${selectedEntries.length === 1 ? '' : 's'} into ${folderName}`);
      await refreshPane(activePane);
    } catch (error) {
      showError(error);
    }
  }

  export async function unpackFolderFlow() {
    const entry = singleSelectedEntry();
    if (!entry?.is_dir) {
      showError('Select one folder to unpack.');
      return;
    }

    try {
      const listing = await getActiveFileSystem().listDirectory(entry.path);
      if (listing.entries.length === 0) {
        showError('The selected folder is empty.');
        return;
      }

      const activePane = activePaneId();
      const destinationPath = pathForPane(activePane);
      const transferred = await transferEntriesWithSafety(
        listing.entries.map((child: FileEntry) => child.path),
        destinationPath,
        'move',
        { pushUndo: false, showSuccess: false },
      );
      if (transferred.length === 0) return;
      await getActiveFileSystem().deleteEntry(entry.path);
      pushUndoEntry({
        description: `Unpack ${entry.name}`,
        undo: async () => {
          const folderPath = await getActiveFileSystem().createDirectory(destinationPath, entry.name);
          for (const item of transferred) {
            await getActiveFileSystem().moveEntry(item.destination, folderPath, 'rename');
          }
        },
      });
      showSuccess(`Unpacked ${entry.name}`);
      await refreshPane(activePane);
    } catch (error) {
      showError(error);
    }
  }

  export function showKeyboardHelpFlow() {
    setOverlayVisible('keyboard-help-overlay', true);
    document.getElementById('keyboard-help-close')?.focus();
  }

  export function closeKeyboardHelpFlow() {
    setOverlayVisible('keyboard-help-overlay', false);
  }

  export function pathsFromNativeDropPayload(payload: NativeFileDropEventPayload | null | undefined) {
    if (Array.isArray(payload)) return payload as PathString[];
    return ((payload?.paths || payload?.files || []) as PathString[]).filter(Boolean);
  }

  export function setExternalDropOverlayVisible(visible: boolean, destination = pathForPane()) {
    const overlay = document.getElementById('external-drop-overlay');
    const pathElement = document.getElementById('external-drop-path');
    if (pathElement) pathElement.textContent = destination || '';
    overlay?.classList.toggle('active', visible);
    overlay?.classList.toggle('visible', visible);
    overlay?.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  export function dropDestinationFromTarget(target: EventTarget | null) {
    const element = target instanceof HTMLElement ? target : null;
    const folderItem = element?.closest<HTMLElement>('.file-item[data-is-dir="true"]');
    if (folderItem?.dataset.path) return folderItem.dataset.path as PathString;
    if (element?.closest('#secondary-file-list')) return pathForPane('secondary') || pathForPane('primary');
    return pathForPane();
  }

  export function resetInternalDragState() {
    appState.draggedItems = [];
    appState.isDragging = false;
  }



  export async function handleContextMenuCommand(commandId: string) {
    hideContextMenu();

    if (commandId === 'ctx-open') {
      await openSelected();
    } else if (commandId === 'ctx-open-with') {
      await openWithFlow();
    } else if (commandId === 'ctx-preview') {
      await showQuickLookFlow();
    } else if (commandId === 'ctx-compare') {
      await compareSelectedFilesFlow();
    } else if (commandId === 'ctx-terminal') {
      openTerminal(pathForPane()).catch(showError);
    } else if (commandId === 'ctx-color-label') {
      await showSetColorLabelFlow();
    } else if (commandId === 'ctx-folder-metrics') {
      await showFolderMetricsFlow();
    } else if (commandId === 'ctx-cleanup') {
      await showDiskCleanupFlow();
    } else if (commandId === 'ctx-duplicates') {
      document.dispatchEvent(new CustomEvent('simplefile:find-duplicates'));
    } else if (commandId === 'ctx-rename') {
      await renameSelectedFlow();
    } else if (commandId === 'ctx-advanced-rename') {
      document.dispatchEvent(new CustomEvent('simplefile:advanced-rename'));
    } else if (commandId === 'ctx-copy') {
      copySelection('copy');
    } else if (commandId === 'ctx-cut') {
      copySelection('cut');
    } else if (commandId === 'ctx-paste') {
      await pasteClipboard();
    } else if (commandId === 'ctx-copy-to-pane') {
      await copyOrMoveToOtherPane('copy');
    } else if (commandId === 'ctx-move-to-pane') {
      await copyOrMoveToOtherPane('move');
    } else if (commandId === 'ctx-pack') {
      await packIntoFolderFlow();
    } else if (commandId === 'ctx-unpack') {
      await unpackFolderFlow();
    } else if (commandId === 'ctx-compress') {
      await showCreateArchiveFlow();
    } else if (commandId === 'ctx-extract') {
      const entry = singleSelectedEntry();
      if (entry) {
        localState.currentArchivePath = entry.path;
        await extractArchiveFlow(pathForPane());
      }
    } else if (commandId === 'ctx-extract-folder') {
      const entry = singleSelectedEntry();
      if (entry) {
        localState.currentArchivePath = entry.path;
        await extractArchiveFlow(joinPath(pathForPane(), archiveExtractFolderNameForPath(entry.path)));
      }
    } else if (commandId === 'ctx-extract-to') {
      const entry = singleSelectedEntry();
      if (entry) {
        const destination = await selectDirectory(pathForPane());
        localState.currentArchivePath = entry.path;
        await extractArchiveFlow(destination);
      }
    } else if (commandId === 'ctx-delete') {
      await deleteSelectedFlow();
    } else if (commandId === 'ctx-info') {
      await showPropertiesFlow();
    }
  }

  export function setElementText(id: string, value: string) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  export function setElementDisplayById(id: string, display: string) {
    const element = document.getElementById(id) as HTMLElement | null;
    if (element) element.style.display = display;
  }

  export function setCheckbox(id: string, checked: boolean) {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) input.checked = checked;
  }

  export function setInputValue(id: string, value: string | number) {
    const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (input) input.value = String(value);
  }

  export function syncSettingsControls() {
    const settings = appState.settings || {};
    setInputValue('settings-theme', settings.theme || appState.theme || 'dark');
    setInputValue('settings-default-view', settings.defaultView || (sessionForPane().isGridView ? 'grid' : 'list'));
    setInputValue('settings-icon-size', settings.defaultIconSize || appState.iconSize || 64);
    setElementText('settings-icon-size-value', `${settings.defaultIconSize || appState.iconSize || 64}px`);
    setCheckbox('settings-show-hidden', Boolean(settings.showHidden));
    setCheckbox('settings-confirm-delete', settings.confirmDelete !== false);
    setCheckbox('settings-new-tab', Boolean(settings.openInNewTab));
    setCheckbox('settings-auto-collapse', Boolean(settings.autoCollapseTree));
    setCheckbox('settings-recent-locations', settings.showRecentLocations !== false);
    setCheckbox('settings-folder-sizes', settings.showFolderSizes !== false);
    setCheckbox('settings-git-integration', settings.enableGitIntegration !== false);
    setInputValue('settings-start-location', settings.startLocation || 'home');
    setInputValue('settings-custom-path', settings.customPath || '');
    setElementDisplayById('settings-custom-path-row', settings.startLocation === 'custom' ? 'grid' : 'none');

    const visibleColumns = new Set(settings.visibleColumns || ['size', 'date', 'type']);
    setCheckbox('settings-col-size', visibleColumns.has('size'));
    setCheckbox('settings-col-items', visibleColumns.has('items'));
    setCheckbox('settings-col-date', visibleColumns.has('date'));
    setCheckbox('settings-col-type', visibleColumns.has('type'));
  }

  export function saveSettingsFromControls() {
    const visibleColumns = [
      ['settings-col-size', 'size'],
      ['settings-col-items', 'items'],
      ['settings-col-date', 'date'],
      ['settings-col-type', 'type'],
    ]
      .filter(([id]) => (document.getElementById(id) as HTMLInputElement | null)?.checked)
      .map(([, value]) => value);

    const iconSize = Number((document.getElementById('settings-icon-size') as HTMLInputElement | null)?.value || appState.iconSize || 64);
    appState.settings = {
      ...appState.settings,
      autoCollapseTree: (document.getElementById('settings-auto-collapse') as HTMLInputElement | null)?.checked || false,
      confirmDelete: (document.getElementById('settings-confirm-delete') as HTMLInputElement | null)?.checked !== false,
      customPath: (document.getElementById('settings-custom-path') as HTMLInputElement | null)?.value?.trim() || '',
      defaultIconSize: iconSize,
      defaultView: (document.getElementById('settings-default-view') as HTMLSelectElement | null)?.value || 'list',
      enableGitIntegration: (document.getElementById('settings-git-integration') as HTMLInputElement | null)?.checked !== false,
      openInNewTab: (document.getElementById('settings-new-tab') as HTMLInputElement | null)?.checked || false,
      showFolderSizes: (document.getElementById('settings-folder-sizes') as HTMLInputElement | null)?.checked !== false,
      showHidden: (document.getElementById('settings-show-hidden') as HTMLInputElement | null)?.checked || false,
      showRecentLocations: (document.getElementById('settings-recent-locations') as HTMLInputElement | null)?.checked !== false,
      startLocation: (document.getElementById('settings-start-location') as HTMLSelectElement | null)?.value || 'home',
      theme: (document.getElementById('settings-theme') as HTMLSelectElement | null)?.value || 'dark',
      visibleColumns,
    };
    appState.theme = appState.settings.theme;
    appState.iconSize = iconSize;
    const isGrid = appState.settings.defaultView === 'grid';
    const showHidden = Boolean(appState.settings.showHidden);
    for (const pane of PANE_IDS) {
      const session = sessionForPane(pane);
      session.isGridView = isGrid;
      session.showHiddenFiles = showHidden;
    }
    document.documentElement.style.setProperty('--icon-size', `${iconSize}px`);
    applyTheme();
    saveSettings();
    applyAllPaneFilters();
    syncSettingsControls();
  }

  
  export async function updateToolStatus() {
    const checks = [
      { id: 'rar-status-text', check: checkRarInstalled },
      
      
    ];

    for (const item of checks) {
      const element = document.getElementById(item.id);
      if (!element) continue;
      element.textContent = 'Checking...';
      try {
        const isInstalled = await item.check();
        element.textContent = isInstalled ? 'Installed' : 'Not installed';
        
        if (item.id === 'rar-status-text') {
          const btn = document.getElementById('rar-install-btn') as HTMLButtonElement;
          if (btn) {
            if (isInstalled) {
              btn.disabled = true;
              btn.textContent = 'Already Installed';
            } else {
              btn.disabled = false;
              btn.textContent = 'Install RAR';
            }
          }
        }
      } catch (error) {
        element.textContent = 'Unavailable';
        element.setAttribute('title', error instanceof Error ? error.message : String(error));
      }
    }

    try {
      setElementText('update-current-version', await getAppVersion());
    } catch {
      setElementText('update-current-version', 'Unavailable');
    }
  }

  export async function setDefaultFileManagerFlow() {
    const btn = document.getElementById('set-default-fm-btn') as HTMLButtonElement;
    const msg = document.getElementById('set-default-fm-msg');
    if (!btn || !msg) return;

    btn.disabled = true;
    btn.textContent = 'Setting...';
    msg.style.display = 'none';

    try {
      await setDefaultFileManager();
      btn.textContent = 'Set as Default';
      btn.disabled = false;
      msg.textContent = 'Successfully set as default file manager.';
      msg.style.color = 'var(--accent-success)';
      msg.style.display = 'block';
    } catch (error) {
      btn.textContent = 'Set as Default';
      btn.disabled = false;
      msg.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
      msg.style.color = 'var(--accent-danger)';
      msg.style.display = 'block';
    }
  }

  export async function installToolFlow(
    label: string,
    install: () => Promise<string>,
    messageId: string,
  ) {
    const message = document.getElementById(messageId) as HTMLElement | null;
    if (message) {
      message.style.display = 'inline';
      message.textContent = `Installing ${label}...`;
    }

    try {
      const result = await install();
      if (message) message.textContent = result || `${label} installed.`;
      showSuccess(`${label} installed`);
      await updateToolStatus();
    } catch (error) {
      if (message) message.textContent = error instanceof Error ? error.message : String(error);
      showError(error);
    }
  }

  


  export async function showAboutFlow() {
    closeSettingsModal();
    try {
      const info = await getAppAboutInfo();
      await showHtmlDialog({
        bodyHtml: `
          <div class="about-body">
            <div class="about-hero">
              <div class="about-logo" aria-hidden="true">SF</div>
              <div class="about-heading">
                <h2 class="about-title">${escapeHtml(info.product_name || 'SimpleFile')}</h2>
                <p class="about-version">Version ${escapeHtml(info.version)}</p>
                <p class="about-description">${escapeHtml(info.description)}</p>
              </div>
            </div>
            <div class="about-details">
              <div class="about-detail-row"><span>Identifier</span><strong>${escapeHtml(info.identifier)}</strong></div>
              <div class="about-detail-row"><span>Build</span><strong>${escapeHtml(info.build_profile)}</strong></div>
              <div class="about-detail-row"><span>Platform</span><strong>${escapeHtml(info.platform)} ${escapeHtml(info.architecture)}</strong></div>
              <div class="about-detail-row"><span>Framework</span><strong>${escapeHtml(info.framework)}</strong></div>
              <div class="about-detail-row"><span>Runtime</span><strong>${escapeHtml(info.runtime)}</strong></div>
              <div class="about-detail-row"><span>Authors</span><strong>${escapeHtml(info.authors)}</strong></div>
            </div>
          </div>
        `,
        confirmText: 'Close',
        showCancel: false,
        title: 'About SimpleFile',
      });
    } catch (error) {
      showError(error);
    }
  }

  export async function checkForUpdatesFlow() {
    const status = document.getElementById('update-status-msg') as HTMLElement | null;
    if (status) {
      status.style.display = 'inline';
      status.textContent = 'Checking for updates...';
    }

    try {
      const update = await checkForUpdate();
      if (update) {
        if (status) status.textContent = `Version ${update.version} is available.`;
        setElementDisplayById('update-install-row', 'flex');
      } else {
        if (status) status.textContent = 'SimpleFile is up to date.';
        setElementDisplayById('update-install-row', 'none');
      }
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
      showError(error);
    }
  }

  export async function installUpdateFlow() {
    const status = document.getElementById('update-install-msg') as HTMLElement | null;
    if (status) {
      status.style.display = 'inline';
      status.textContent = 'Installing update...';
    }

    try {
      await installUpdate();
      if (status) status.textContent = 'Update installation started.';
      showSuccess('Update installation started');
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
      showError(error);
    }
  }
