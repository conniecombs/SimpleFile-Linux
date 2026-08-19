import { onMount } from 'svelte';
import { invokeCommand } from '../tauri.js';
  // @ts-ignore
  import { addBookmark, addRecentLocation, clearRecentLocations, loadBookmarks, loadRecentLocations, loadSettings, loadTabs, removeBookmark, saveSettings, saveTabs, state as appState } from './state.svelte.ts';
  // @ts-ignore
  import { resolveStartupLocation } from './startup-location.ts';
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
    getHomeDir,
    listDirectory,
    listDrives,
    listSubdirectories,
    listArchive,
    loadSmartFolders,
    moveEntryResolved,
    moveWithProgress,
    moveToTrash,
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
    unwatchDirectory,
    getStartupPath,
    showMainWindow,
    onOpenPath,
    onSecondInstance,
    onDrivesChanged,
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
    OperationId,
    PathString,
    ProgressUpdate,
    RenameRequest,
    SearchOptions,
    SmartFolder,
    TransferResult,
  } from '../types';
import { localState } from './localState.svelte';
import type { PaneId } from "../paneSession.js";
import { normalizePaneId } from "../paneSession.js";

import { showCreateArchiveFlow, closeArchiveFlow, extractArchiveFlow } from "./archive.js";
import { applyPersistedViewSettings, updateStatusBar, loadTagsFlow, loadDirectory, loadPaneDirectory, openEntryPath, filteredEntriesForPane, selectedSetForPane, selectPanePaths, updatePreviewPane, navigateHistory, refreshCurrentDirectory, createFolderFlow, createFileFlow, renameSelectedFlow, copySelection, pasteClipboard, deleteSelectedFlow, undoLastFlow, redoLastFlow, showClipboardHistoryFlow, showSetColorLabelFlow, showFolderMetricsFlow, showDiskCleanupFlow, closePreviewPaneFlow, applyTheme, loadSecondaryDirectory, pathForPane, navigateSpecial, navigateSecondaryHistory, loadTreeChildren, applyPaneFilters, openNewTab, switchToTab, closeTab, moveTabFocus, showQuickLookFlow, showKeyboardHelpFlow, showContextMenuAt, handleContextMenuCommand, hideContextMenu, closeSettingsModal, syncSettingsControls, updateToolStatus, saveSettingsFromControls, installToolFlow, checkForUpdatesFlow, installUpdateFlow, showAboutFlow, overlayById, closeQuickLookFlow, closeKeyboardHelpFlow, hideProgressFlow, selectAllEntries, refreshPane, openSelected, updateProgressFlow, scheduleFileChangeRefresh, setDefaultFileManagerFlow, activatePane, activePaneId, sessionForPane, toggleDualPane, movePaneFocus, focusPaneEdge, handlePaneTypeAhead, setPaneFilterQuery, openPaneFilter, closePaneFilter, togglePaneHiddenFiles, togglePaneView, sortPane } from "./core.js";
import { installDragAndDrop } from "../dragAndDrop";
import { installMarqueeSelection } from "../marqueeSelection";
import { loadSmartFoldersFlow, runSearch, clearSearch, setSearchControlsVisible, openAdvancedSearchFlow, saveCurrentSearchAsSmartFolderFlow, openSmartFolderFlow, deleteSmartFolderFlow, showPropertiesFlow } from "./search.js";


export function initApp() {
    loadSettings();
    loadBookmarks();
    loadRecentLocations();
    const tabsLoaded = loadTabs();
    applyPersistedViewSettings();
    renderLayoutShell(localState.appContainer);
    renderContextMenu(document.getElementById('context-menu'));
    updateStatusBar();
    void loadSmartFoldersFlow();
    void loadTagsFlow();

    getHomeDir().then(async (home) => {
      appState.homePath = home;
      
      try {

        const xdg = await invokeCommand('get_xdg_dirs', {}) as Record<string, string | null>;
        appState.xdgDirs = xdg;
      } catch (e) {
        console.error("Failed to fetch XDG directories", e);
      }

      const fallbackDrive = createFallbackDriveForPath(home);
      if (fallbackDrive && (!appState.drives || appState.drives.length === 0)) {
        appState.drives = [fallbackDrive];
      }

      getStartupPath().then((startupPath) => {
        let finalStartPath = startupPath;
        if (!finalStartPath) {
          const primary = sessionForPane('primary');
          const startup = resolveStartupLocation({
            activeTabId: primary.activeTabId,
            homePath: home,
            settings: appState.settings,
            tabs: primary.tabs,
            tabsLoaded,
          });
          primary.tabs = (startup.tabs || []).map((tab) => ({
            history: Array.isArray(tab.history) ? [...tab.history] : [tab.path || home],
            historyIndex: Number.isInteger(tab.historyIndex) ? Number(tab.historyIndex) : 0,
            id: tab.id,
            path: tab.path || home,
            title: String(tab.path || home).split('/').filter(Boolean).pop() || tab.path || home,
          }));
          primary.activeTabId = startup.activeTabId;
          primary.history = startup.history || [];
          primary.historyIndex = Number.isInteger(startup.historyIndex) ? Number(startup.historyIndex) : -1;
          finalStartPath = startup.startPath;
        } else {
          const primary = sessionForPane('primary');
          primary.tabs = [{
            id: '1',
            path: finalStartPath,
            title: finalStartPath.split('/').filter(Boolean).pop() || finalStartPath,
            history: [finalStartPath],
            historyIndex: 0,
          }];
          primary.activeTabId = '1';
          primary.history = [finalStartPath];
          primary.historyIndex = 0;
        }

        const primary = sessionForPane('primary');
        const startPath = finalStartPath || appState.homePath || '/';
        const historyMode = primary.history.length > 0 ? 'replace-current' : 'push';
        const pending = [loadPaneDirectory('primary', startPath, historyMode, { activate: true })];
        if (appState.dualPaneEnabled && sessionForPane('secondary').path) {
          pending.push(loadPaneDirectory('secondary', sessionForPane('secondary').path, 'none', { activate: false }));
        }
        return Promise.all(pending);
      }).then(() => {
        showMainWindow();
      }).catch(console.error);
    }).catch(console.error);

    onOpenPath((event) => {
      openNewTab(event.payload);
      showMainWindow();
    });

    onSecondInstance((event) => {
      const args = event.payload.args;
      if (args && args.length > 1) {
        // Assume args[1] is a path
        openNewTab(args[1]);
      }
      showMainWindow();
    });

    onDrivesChanged(() => {
      listDrives().then((drives) => {
        if (drives.length > 0) {
          appState.drives = drives;
        }
      }).catch(console.error);
    });

    listDrives().then((drives) => {
      if (drives.length > 0) {
        appState.drives = drives;
        return;
      }

      const fallbackDrive = createFallbackDriveForPath(appState.homePath || pathForPane('primary'));
      if (fallbackDrive) {
        appState.drives = [fallbackDrive];
      }
    }).catch((error) => {
      console.error('Failed to load drives:', error);
      const fallbackDrive = createFallbackDriveForPath(appState.homePath || pathForPane('primary'));
      if (fallbackDrive) {
        appState.drives = [fallbackDrive];
      }
    });

    const handleOpenEntry = (e: any) => {
      const path = e.detail?.path || e.detail?.segment?.path;
      if (!path) return;

      // Tree-node and breadcrumb events are always directories; infer isDir
      // from the event type if the detail doesn't already include it.
      const alwaysDir = e.type === 'simplefile:tree-node-open' || e.type === 'simplefile:breadcrumb-navigate';
      const isDir = e.detail?.isDir ?? alwaysDir;

      void openEntryPath(path, isDir, normalizePaneId(e.detail?.pane, activePaneId()));
    };

    const handleItemSelection = (e: any) => {
      const { ctrlKey, index, metaKey, pane = 'primary', path, shiftKey } = e.detail;
      if (!path) return;
      const activePane = pane === 'secondary' ? 'secondary' : 'primary';
      const paneEntries = filteredEntriesForPane(activePane);
      const paneSelection = selectedSetForPane(activePane);
      const session = sessionForPane(activePane);

      if (shiftKey && session.lastSelectedIndex >= 0) {
        const start = Math.min(session.lastSelectedIndex, index);
        const end = Math.max(session.lastSelectedIndex, index);
        const selectedRange = paneEntries.slice(start, end + 1).map((entry: FileEntry) => entry.path);
        selectPanePaths(activePane, selectedRange, index, { keepAnchor: true });
        return;
      }

      if (ctrlKey || metaKey) {
        const nextSelection = new Set(paneSelection);
        if (nextSelection.has(path)) nextSelection.delete(path);
        else nextSelection.add(path);
        selectPanePaths(activePane, [...nextSelection], index);
        return;
      }

      selectPanePaths(activePane, [path], index);
    };

    const handleToolbarCommand = (e: any) => {
      const command = e.detail.command;
      if (command === 'back') void navigateHistory(-1, activePaneId());
      else if (command === 'forward') void navigateHistory(1, activePaneId());
      else if (command === 'up') {
        const parent = getParentPath(pathForPane());
        if (parent) void loadDirectory(parent);
      } else if (command === 'refresh') {
        void refreshCurrentDirectory();
      } else if (command === 'new-folder') {
        void createFolderFlow();
      } else if (command === 'new-file') {
        void createFileFlow();
      } else if (command === 'rename') {
        void renameSelectedFlow();
      } else if (command === 'copy') {
        copySelection('copy');
      } else if (command === 'cut') {
        copySelection('cut');
      } else if (command === 'paste') {
        void pasteClipboard();
      } else if (command === 'delete') {
        void deleteSelectedFlow();
      } else if (command === 'undo') {
        void undoLastFlow();
      } else if (command === 'redo') {
        void redoLastFlow();
      } else if (command === 'clipboard-history') {
        void showClipboardHistoryFlow();
      } else if (command === 'color-label') {
        void showSetColorLabelFlow();
      } else if (command === 'folder-metrics') {
        void showFolderMetricsFlow();
      } else if (command === 'disk-cleanup') {
        void showDiskCleanupFlow();
      } else if (command === 'find-duplicates') {
        document.dispatchEvent(new CustomEvent('simplefile:find-duplicates'));
      } else if (command === 'view-toggle') {
        togglePaneView();
        appState.settings = { ...appState.settings, defaultView: sessionForPane().isGridView ? 'grid' : 'list' };
        saveSettings();
      } else if (command === 'hidden-toggle') {
        togglePaneHiddenFiles();
      } else if (command === 'preview-toggle') {
        appState.showPreviewPane = !appState.showPreviewPane;
        if (appState.showPreviewPane) void updatePreviewPane();
        else closePreviewPaneFlow();
      } else if (command === 'theme-toggle') {
        appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
        appState.settings = { ...appState.settings, theme: appState.theme };
        applyTheme();
        saveSettings();
      } else if (command === 'dual-pane') {
        void toggleDualPane();
      } else if (command === 'terminal') {
        openTerminal(pathForPane()).catch(showError);
      } else if (command.startsWith?.('navigate')) {
        void navigateSpecial(command);
      }
    };

    const handlePaneActivate = (e: any) => {
      activatePane(normalizePaneId(e.detail?.pane, activePaneId()));
    };

    const handleQuickFilterInput = (e: any) => {
      const pane = normalizePaneId(e.detail?.pane, activePaneId());
      setPaneFilterQuery(pane, String(e.detail?.query || ''));
    };

    const handleQuickFilterClear = (e: any) => {
      const pane = normalizePaneId(e.detail?.pane, activePaneId());
      closePaneFilter(pane);
    };

    const handleTreeToggle = async (e: any) => {
      const path = e.detail?.path;
      if (!path) return;

      const expanded = new Set(appState.treeExpanded);
      if (expanded.has(path)) {
        expanded.delete(path);
      } else {
        expanded.add(path);
        if (!appState.treeData.has(path)) {
          try {
            await loadTreeChildren(path);
          } catch (error) {
            showError(error);
          }
        }
      }
      appState.treeExpanded = expanded;
    };

    const handleSort = (e: any) => {
      const sortBy = e.detail?.sort;
      if (!sortBy) return;
      sortPane(normalizePaneId(e.detail?.pane, activePaneId()), sortBy);
    };

    const handleIconSize = (e: any) => {
      const value = Math.max(48, Math.min(128, Number(e.detail?.value || appState.iconSize || 64)));
      appState.iconSize = value;
      appState.settings = { ...appState.settings, defaultIconSize: value };
      document.documentElement.style.setProperty('--icon-size', `${value}px`);
      if (e.detail?.commit) saveSettings();
    };

    const handleToast = (e: any) => {
      const { message, type } = e.detail || {};
      if (type === 'error') showError(message);
      else showSuccess(message);
    };

    const handleSearchSubmit = (e: any) => {
      void runSearch(e.detail?.query || '');
    };

    const handleSearchClear = () => {
      void clearSearch();
    };

    const handleSearchCancel = () => {
      const session = sessionForPane();
      if (session.search.currentSearchId) {
        cancelSearch(session.search.currentSearchId).catch(showError);
      }
      session.search.currentSearchId = null;
      session.search.isSearching = false;
      setSearchControlsVisible({ clear: session.search.searchMode, cancel: false });
    };

    const handleSearchAdvanced = () => {
      void openAdvancedSearchFlow();
    };

    const handleSearchResultsSave = (e: any) => {
      if (e.detail?.handled) return;
      void saveCurrentSearchAsSmartFolderFlow();
    };

    const handleSearchFocus = () => {
      const input = document.getElementById('search-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    };

    const handleSmartFolderOpen = (e: any) => {
      void openSmartFolderFlow(e.detail?.folder);
    };

    const handleSmartFolderDelete = (e: any) => {
      void deleteSmartFolderFlow(e.detail?.id);
    };

    const handleSmartFoldersChanged = (e: any) => {
      if (Array.isArray(e.detail?.smartFolders)) {
        appState.smartFolders = e.detail.smartFolders;
      }
    };

    const paneFromTabEvent = (e: any) => normalizePaneId(e.detail?.pane, activePaneId());

    const handleTabNew = (e: any) => {
      const pane = paneFromTabEvent(e);
      activatePane(pane);
      void openNewTab(pathForPane(pane) || appState.homePath, pane);
    };

    const handleTabSwitch = (e: any) => {
      const tabId = e.detail?.tabId;
      if (!tabId) return;
      const pane = paneFromTabEvent(e);
      activatePane(pane);
      void switchToTab(tabId, pane);
    };

    const handleTabClose = (e: any) => {
      const tabId = e.detail?.tabId;
      if (!tabId) return;
      const pane = paneFromTabEvent(e);
      activatePane(pane);
      void closeTab(tabId, pane);
    };

    const handleTabFocusMove = (e: any) => {
      const tabId = e.detail?.tabId;
      const direction = Number(e.detail?.direction || 0);
      if (!tabId || !direction) return;
      const pane = paneFromTabEvent(e);
      activatePane(pane);
      moveTabFocus(tabId, direction, pane);
    };

    const handleProperties = () => {
      void showPropertiesFlow();
    };

    const handleQuickLook = () => {
      void showQuickLookFlow();
    };

    const handlePreviewClose = () => {
      closePreviewPaneFlow();
    };

    const handleCreateArchive = () => {
      void showCreateArchiveFlow();
    };

    const handleKeyboardHelp = () => {
      showKeyboardHelpFlow();
    };

    const handleSetColorLabel = () => {
      void showSetColorLabelFlow();
    };

    const handleFolderMetrics = () => {
      void showFolderMetricsFlow();
    };

    const handleDiskCleanup = () => {
      void showDiskCleanupFlow();
    };

    const handleFileListContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const fileList = target?.closest('#file-list, #secondary-file-list');
      if (!fileList) return;
      const pane: PaneId = fileList.id === 'secondary-file-list' ? 'secondary' : 'primary';
      const selectedSet = selectedSetForPane(pane);

      event.preventDefault();
      const item = target?.closest<HTMLElement>('.file-item');
      if (item?.dataset.path) {
        const index = Number(item.dataset.index ?? -1);
        if (!selectedSet.has(item.dataset.path)) {
          selectPanePaths(pane, [item.dataset.path], Number.isFinite(index) ? index : -1);
        }
      } else {
        appState.activePane = pane;
        updateStatusBar();
      }

      showContextMenuAt(event.clientX, event.clientY);
    };

    const handleContextMenuClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('#context-menu button[id]');
      if (!button || button.disabled) return;
      event.preventDefault();
      void handleContextMenuCommand(button.id);
    };

    const handleDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('#context-menu')) {
        hideContextMenu();
      }
    };

    const handleSettingsOpen = () => {
      try {
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        const cancelBtn = document.getElementById('modal-cancel');
        const confirmBtn = document.getElementById('modal-confirm');
        const closeBtn = document.getElementById('modal-close');

        if (!overlay || !body) {
          showError('Settings modal elements not found in DOM');
          console.error("Settings modal elements not found in DOM");
          return;
        }

        if (title) title.textContent = 'Settings';
        modal?.classList.add('settings-modal');
        body.classList.add('settings-body');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (confirmBtn) {
          confirmBtn.textContent = 'Close';
          confirmBtn.onclick = closeSettingsModal;
        }
        if (closeBtn) {
          closeBtn.onclick = closeSettingsModal;
        }

        renderSettingsBody(body);
        window.setTimeout(() => {
          syncSettingsControls();
          void updateToolStatus();
        }, 0);
        overlay.classList.add('visible');
      } catch (err: any) {
        showError(`Failed to open settings: ${err?.message || err}`);
        console.error("Failed to open settings:", err);
      }
    };

    const persistedSettingsControlIds = new Set([
      'settings-theme',
      'settings-default-view',
      'settings-icon-size',
      'settings-show-hidden',
      'settings-confirm-delete',
      'settings-new-tab',
      'settings-auto-collapse',
      'settings-recent-locations',
      'settings-folder-sizes',
      'settings-git-integration',
      'settings-start-location',
      'settings-custom-path',
      'settings-col-size',
      'settings-col-items',
      'settings-col-date',
      'settings-col-type',
    ]);

    const handleSettingsChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      if (!target.closest('.settings-body') || !persistedSettingsControlIds.has(target.id)) return;
      saveSettingsFromControls();
    };

    const handleSettingsInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.id !== 'settings-icon-size') return;
      if (!target.closest('.settings-body')) return;
      saveSettingsFromControls();
    };

    const handleSettingsClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('.settings-body button[id]');
      if (!button || button.disabled) return;

      let handled = true;
      switch (button.id) {
        case 'settings-custom-path-browse':
          void (async () => {
            try {
              const fallbackPath = pathForPane() || appState.homePath || null;
              const selectedPath = await selectDirectory(fallbackPath);
              if (!selectedPath) return;
              const customPathInput = document.getElementById('settings-custom-path') as HTMLInputElement | null;
              const startLocationSelect = document.getElementById('settings-start-location') as HTMLSelectElement | null;
              if (customPathInput) customPathInput.value = selectedPath;
              if (startLocationSelect) startLocationSelect.value = 'custom';
              saveSettingsFromControls();
              showSuccess('Startup folder updated');
            } catch (error) {
              showError(error);
            }
          })();
          break;
        case 'rar-install-btn':
          void installToolFlow('RAR', installRar, 'rar-install-msg');
          break;
        case 'set-default-fm-btn':
          void setDefaultFileManagerFlow();
          break;
        case 'update-check-btn':
          void checkForUpdatesFlow();
          break;
        case 'update-install-btn':
          void installUpdateFlow();
          break;
        case 'btn-about':
          void showAboutFlow();
          break;
        default:
          handled = false;
      }

      if (handled) {
        event.preventDefault();
      }
    };

    const handleSettingsListClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target?.closest('.settings-body')) return;

      const removeButton = target.closest<HTMLButtonElement>('.bookmark-remove');
      if (removeButton) {
        const bookmarkRow = removeButton.closest<HTMLElement>('.bookmark-item');
        if (bookmarkRow?.dataset.id && removeBookmark(bookmarkRow.dataset.id)) {
          event.preventDefault();
          showSuccess('Bookmark removed');
        }
        return;
      }

      const row = target.closest<HTMLElement>('.bookmark-item, .recent-item');
      if (!row?.dataset.path) return;
      event.preventDefault();
      closeSettingsModal();
      void loadDirectory(row.dataset.path);
    };


    const handleStage5OverlayClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;

      const quickLookOverlay = overlayById('quicklook-overlay');
      if (quickLookOverlay?.classList.contains('visible')) {
        if (target === quickLookOverlay || target.closest('#quicklook-close')) {
          event.preventDefault();
          closeQuickLookFlow();
          return;
        }
        if (target.closest('#quicklook-open')) {
          event.preventDefault();
          if (localState.currentQuickLookPath) openFile(localState.currentQuickLookPath).catch(showError);
          return;
        }
      }

      const archiveOverlay = overlayById('archive-overlay');
      if (archiveOverlay?.classList.contains('visible')) {
        if (target === archiveOverlay || target.closest('#archive-close, #archive-cancel')) {
          event.preventDefault();
          closeArchiveFlow();
          return;
        }
        if (target.closest('#archive-extract')) {
          event.preventDefault();
          void extractArchiveFlow(pathForPane());
          return;
        }
      }

      const keyboardHelpOverlay = overlayById('keyboard-help-overlay');
      if (
        keyboardHelpOverlay?.classList.contains('visible')
        && (target === keyboardHelpOverlay || target.closest('#keyboard-help-close, #keyboard-help-ok'))
      ) {
        event.preventDefault();
        closeKeyboardHelpFlow();
        return;
      }

      if (target.closest('#progress-cancel')) {
        event.preventDefault();
        if (localState.currentProgressOperationId) {
          cancelOperation(localState.currentProgressOperationId).catch(showError);
        }
        hideProgressFlow();
      }
    };

    const handleModalPointerDown = (event: MouseEvent) => {
      if (
        event.target === document.getElementById('modal-overlay')
        && document.getElementById('modal')?.classList.contains('settings-modal')
      ) {
        closeSettingsModal();
      }
    };

    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement;
      const key = event.key.toLowerCase();

      if (target?.id === 'path-input' && event.key === 'Enter') {
        event.preventDefault();
        const value = (target as HTMLInputElement).value.trim();
        if (value) void loadDirectory(value);
        return;
      }

      if (target?.id === 'secondary-path-input' && event.key === 'Enter') {
        event.preventDefault();
        const value = (target as HTMLInputElement).value.trim();
        if (value) void loadPaneDirectory('secondary', value);
        return;
      }

      if (event.key === 'Escape') {
        if (overlayById('quicklook-overlay')?.classList.contains('visible')) {
          event.preventDefault();
          closeQuickLookFlow();
          return;
        }
        if (overlayById('archive-overlay')?.classList.contains('visible')) {
          event.preventDefault();
          closeArchiveFlow();
          return;
        }
        if (overlayById('keyboard-help-overlay')?.classList.contains('visible')) {
          event.preventDefault();
          closeKeyboardHelpFlow();
          return;
        }
        if (overlayById('progress-overlay')?.classList.contains('visible')) {
          event.preventDefault();
          hideProgressFlow();
          return;
        }
      }

      if (
        event.key === 'Escape'
        && document.getElementById('modal-overlay')?.classList.contains('visible')
        && document.getElementById('modal')?.classList.contains('settings-modal')
      ) {
        closeSettingsModal();
        return;
      }

      if (event.key === 'Escape') {
        hideContextMenu();
        appState.commandPaletteVisible = false;
      }

      if (event.ctrlKey && event.shiftKey && key === 'p') {
        event.preventDefault();
        appState.commandPaletteVisible = true;
        return;
      }

      if (event.ctrlKey && event.shiftKey && key === 'd') {
        event.preventDefault();
        document.dispatchEvent(new CustomEvent('simplefile:find-duplicates'));
        return;
      }

      if (event.ctrlKey && key === 'f') {
        event.preventDefault();
        handleSearchFocus();
        return;
      }

      if (event.ctrlKey && key === 'l') {
        event.preventDefault();
        const pathInput = document.getElementById('path-input') as HTMLInputElement | null;
        pathInput?.focus();
        pathInput?.select();
        return;
      }

      if (event.key === 'F6') {
        event.preventDefault();
        void toggleDualPane();
        return;
      }

      if (isTextInput || document.getElementById('modal-overlay')?.classList.contains('visible')) {
        return;
      }

      if (event.key === 'Tab' && appState.dualPaneEnabled) {
        event.preventDefault();
        activatePane(activePaneId() === 'primary' ? 'secondary' : 'primary');
        return;
      }

      if (event.ctrlKey && key === 't') {
        event.preventDefault();
        void openNewTab();
        return;
      }

      if (event.ctrlKey && key === 'w') {
        event.preventDefault();
        const session = sessionForPane();
        if (session.activeTabId) void closeTab(session.activeTabId);
        return;
      }

      if (event.ctrlKey && key === 'h') {
        event.preventDefault();
        togglePaneHiddenFiles();
        return;
      }

      if (event.ctrlKey && event.shiftKey && key === 'f') {
        event.preventDefault();
        const pane = activePaneId();
        openPaneFilter(pane);
        requestAnimationFrame(() => {
          document.getElementById(pane === 'secondary' ? 'secondary-filter-input' : 'filter-input')?.focus();
        });
        return;
      }

      if (event.ctrlKey && event.shiftKey && key === 'n') {
        event.preventDefault();
        void createFileFlow();
      } else if (event.ctrlKey && key === 'n') {
        event.preventDefault();
        void createFolderFlow();
      } else if (event.ctrlKey && key === 'a') {
        event.preventDefault();
        selectAllEntries();
      } else if (event.ctrlKey && key === 'c') {
        event.preventDefault();
        copySelection('copy');
      } else if (event.ctrlKey && key === 'x') {
        event.preventDefault();
        copySelection('cut');
      } else if (event.ctrlKey && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault();
        void redoLastFlow();
      } else if (event.ctrlKey && key === 'z') {
        event.preventDefault();
        void undoLastFlow();
      } else if (event.ctrlKey && event.shiftKey && key === 'v') {
        event.preventDefault();
        void showClipboardHistoryFlow();
      } else if (event.ctrlKey && key === 'v') {
        event.preventDefault();
        void pasteClipboard();
      } else if (event.key === 'F2') {
        event.preventDefault();
        void renameSelectedFlow();
      } else if (event.key === 'F4') {
        event.preventDefault();
        openTerminal(pathForPane()).catch(showError);
      } else if (event.key === 'Delete') {
        event.preventDefault();
        void deleteSelectedFlow();
      } else if (event.key === 'F5') {
        event.preventDefault();
        void refreshPane(activePaneId());
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        const parent = getParentPath(pathForPane());
        if (parent) void loadDirectory(parent);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        movePaneFocus(1, event.shiftKey);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        movePaneFocus(-1, event.shiftKey);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusPaneEdge('first');
      } else if (event.key === 'End') {
        event.preventDefault();
        focusPaneEdge('last');
      } else if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        const pane = activePaneId();
        openPaneFilter(pane);
        requestAnimationFrame(() => {
          document.getElementById(pane === 'secondary' ? 'secondary-filter-input' : 'filter-input')?.focus();
        });
      } else if ((event.key === ' ' || event.code === 'Space') && !(target instanceof HTMLButtonElement) && !(target instanceof HTMLAnchorElement)) {
        event.preventDefault();
        void showQuickLookFlow();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void openSelected();
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        handlePaneTypeAhead(event.key);
      }
    };

    const handleOperationProgress = (event: { payload: ProgressUpdate }) => {
      const update = event.payload;
      if (!update?.operation_id) return;

      const percent = update.total > 0 ? (update.current / update.total) * 100 : 0;
      if (localState.currentProgressOperationId === update.operation_id) {
        updateProgressFlow(percent, update.current_item || '');
      }


    };

    const handleFileChange = (event: { payload: { path?: PathString } }) => {
      const path = event.payload?.path;
      if (path) scheduleFileChangeRefresh(path);
    };

    const unlistenPromises = [
      onFileChange(handleFileChange),
      onOperationProgress(handleOperationProgress),
    ];
    const teardownDragAndDrop = installDragAndDrop();
    const teardownMarqueeSelection = installMarqueeSelection();

    document.addEventListener('simplefile:file-list-item-open', handleOpenEntry);
    document.addEventListener('simplefile:file-list-item-click', handleItemSelection);
    document.addEventListener('simplefile:tree-node-open', handleOpenEntry);
    document.addEventListener('simplefile:tree-node-toggle', handleTreeToggle);
    document.addEventListener('simplefile:breadcrumb-navigate', handleOpenEntry);
    document.addEventListener('simplefile:file-list-sort', handleSort);
    document.addEventListener('simplefile:toolbar-command', handleToolbarCommand);
    document.addEventListener('simplefile:pane-activate', handlePaneActivate);
    document.addEventListener('simplefile:quick-filter-input', handleQuickFilterInput);
    document.addEventListener('simplefile:quick-filter-clear', handleQuickFilterClear);
    document.addEventListener('simplefile:toolbar-icon-size', handleIconSize);
    document.addEventListener('simplefile:toast', handleToast);
    document.addEventListener('simplefile:open-settings', handleSettingsOpen);
    document.addEventListener('simplefile:search-submit', handleSearchSubmit);
    document.addEventListener('simplefile:search-clear', handleSearchClear);
    document.addEventListener('simplefile:search-results-clear', handleSearchClear);
    document.addEventListener('simplefile:search-cancel', handleSearchCancel);
    document.addEventListener('simplefile:search-open-advanced', handleSearchAdvanced);
    document.addEventListener('simplefile:search-results-save', handleSearchResultsSave);
    document.addEventListener('simplefile:focus-search', handleSearchFocus);
    document.addEventListener('simplefile:smart-folder-open', handleSmartFolderOpen);
    document.addEventListener('simplefile:smart-folder-delete', handleSmartFolderDelete);
    document.addEventListener('simplefile:smart-folders-changed', handleSmartFoldersChanged);
    document.addEventListener('simplefile:tab-new', handleTabNew);
    document.addEventListener('simplefile:tab-switch', handleTabSwitch);
    document.addEventListener('simplefile:tab-close', handleTabClose);
    document.addEventListener('simplefile:tab-focus-move', handleTabFocusMove);
    document.addEventListener('simplefile:properties', handleProperties);
    document.addEventListener('simplefile:quick-look', handleQuickLook);
    document.addEventListener('simplefile:preview-close', handlePreviewClose);
    document.addEventListener('simplefile:create-archive', handleCreateArchive);
    document.addEventListener('simplefile:keyboard-help', handleKeyboardHelp);
    document.addEventListener('simplefile:set-color-label', handleSetColorLabel);
    document.addEventListener('simplefile:folder-metrics', handleFolderMetrics);
    document.addEventListener('simplefile:disk-cleanup', handleDiskCleanup);
    document.addEventListener('contextmenu', handleFileListContextMenu);
    document.addEventListener('click', handleContextMenuClick);
    document.addEventListener('click', handleSettingsClick);
    document.addEventListener('click', handleSettingsListClick);

    document.addEventListener('click', handleStage5OverlayClick);
    document.addEventListener('change', handleSettingsChange);
    document.addEventListener('input', handleSettingsInput);
    document.addEventListener('mousedown', handleDocumentPointerDown);
    document.addEventListener('mousedown', handleModalPointerDown);
    document.addEventListener('keydown', handleKeydown);

    return () => {
      if (localState.fileChangeRefreshTimer !== null) {
        window.clearTimeout(localState.fileChangeRefreshTimer);
        localState.fileChangeRefreshTimer = null;
      }
      unwatchDirectory().catch(() => {});
      Promise.all(unlistenPromises).then((unlisteners) => {
        for (const unlisten of unlisteners) void unlisten();
      }).catch(() => {});
      document.removeEventListener('simplefile:file-list-item-open', handleOpenEntry);
      document.removeEventListener('simplefile:file-list-item-click', handleItemSelection);
      document.removeEventListener('simplefile:tree-node-open', handleOpenEntry);
      document.removeEventListener('simplefile:tree-node-toggle', handleTreeToggle);
      document.removeEventListener('simplefile:breadcrumb-navigate', handleOpenEntry);
      document.removeEventListener('simplefile:file-list-sort', handleSort);
      document.removeEventListener('simplefile:toolbar-command', handleToolbarCommand);
      document.removeEventListener('simplefile:pane-activate', handlePaneActivate);
      document.removeEventListener('simplefile:quick-filter-input', handleQuickFilterInput);
      document.removeEventListener('simplefile:quick-filter-clear', handleQuickFilterClear);
      document.removeEventListener('simplefile:toolbar-icon-size', handleIconSize);
      document.removeEventListener('simplefile:toast', handleToast);
      document.removeEventListener('simplefile:open-settings', handleSettingsOpen);
      document.removeEventListener('simplefile:search-submit', handleSearchSubmit);
      document.removeEventListener('simplefile:search-clear', handleSearchClear);
      document.removeEventListener('simplefile:search-results-clear', handleSearchClear);
      document.removeEventListener('simplefile:search-cancel', handleSearchCancel);
      document.removeEventListener('simplefile:search-open-advanced', handleSearchAdvanced);
      document.removeEventListener('simplefile:search-results-save', handleSearchResultsSave);
      document.removeEventListener('simplefile:focus-search', handleSearchFocus);
      document.removeEventListener('simplefile:smart-folder-open', handleSmartFolderOpen);
      document.removeEventListener('simplefile:smart-folder-delete', handleSmartFolderDelete);
      document.removeEventListener('simplefile:smart-folders-changed', handleSmartFoldersChanged);
      document.removeEventListener('simplefile:tab-new', handleTabNew);
      document.removeEventListener('simplefile:tab-switch', handleTabSwitch);
      document.removeEventListener('simplefile:tab-close', handleTabClose);
      document.removeEventListener('simplefile:tab-focus-move', handleTabFocusMove);
      document.removeEventListener('simplefile:properties', handleProperties);
      document.removeEventListener('simplefile:quick-look', handleQuickLook);
      document.removeEventListener('simplefile:preview-close', handlePreviewClose);
      document.removeEventListener('simplefile:create-archive', handleCreateArchive);
      document.removeEventListener('simplefile:keyboard-help', handleKeyboardHelp);
      document.removeEventListener('simplefile:set-color-label', handleSetColorLabel);
      document.removeEventListener('simplefile:folder-metrics', handleFolderMetrics);
      document.removeEventListener('simplefile:disk-cleanup', handleDiskCleanup);
      document.removeEventListener('contextmenu', handleFileListContextMenu);
      document.removeEventListener('click', handleContextMenuClick);
      document.removeEventListener('click', handleSettingsClick);
      document.removeEventListener('click', handleSettingsListClick);

      document.removeEventListener('click', handleStage5OverlayClick);
      document.removeEventListener('change', handleSettingsChange);
      document.removeEventListener('input', handleSettingsInput);
      document.removeEventListener('mousedown', handleDocumentPointerDown);
      document.removeEventListener('mousedown', handleModalPointerDown);
      document.removeEventListener('keydown', handleKeydown);
      teardownDragAndDrop();
      teardownMarqueeSelection();
    };

}
