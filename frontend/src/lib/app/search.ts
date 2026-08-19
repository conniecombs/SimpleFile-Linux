
import { onMount } from 'svelte';
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
    chmodFile,
    chownFile,
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
import { localState } from './localState.svelte';
import type { PaneId } from "../paneSession.js";
import { createPaneSearchState } from "../paneSession.js";
import { escapeHtml } from "./core.js";
import { showHtmlDialog, uniqueId, applyPaneFilters, selectPanePaths, updateStatusBar, selectedSetForPane, currentSelectionPaths, findEntryInPane, setElementText, sessionForPane, activePaneId } from "./core.js";

  export function setSearchControlsVisible({ clear = false, cancel = false } = {}) {
    const clearBtn = document.getElementById('search-clear') as HTMLElement | null;
    const cancelBtn = document.getElementById('search-cancel') as HTMLElement | null;
    if (clearBtn) clearBtn.style.display = clear ? 'inline-flex' : 'none';
    if (cancelBtn) cancelBtn.style.display = cancel ? 'inline-flex' : 'none';
  }

  export function renderSearchHeader(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    const listId = pane === 'secondary' ? 'secondary-file-list' : 'file-list';
    const list = document.getElementById(listId);
    if (!session.search.searchMode) {
      clearSearchResultsHeader(list?.parentElement?.querySelector(':scope > .search-results-header'));
      return;
    }

    const count = session.search.results?.length || 0;
    renderSearchResultsHeader(
      list?.parentElement,
      list,
      {
        clearLabel: 'Clear',
        label: `${count} result${count === 1 ? '' : 's'} for "${session.search.query}"`,
        onClear: () => {
          void clearSearch(pane);
        },
        onSave: () => {
          void saveCurrentSearchAsSmartFolderFlow(pane);
        },
        saveLabel: 'Save Search',
      },
    );
  }

  export function searchOptionsToWorkflowOptions(options: SearchOptions): SearchWorkflowOptions {
    return {
      caseSensitive: options.case_sensitive,
      contentSearch: options.content_search,
      dateAfter: options.date_after ?? null,
      dateBefore: options.date_before ?? null,
      fileTypes: options.file_types ?? [],
      includeHidden: options.include_hidden,
      maxDepth: options.max_depth ?? null,
      maxResults: options.max_results ?? null,
      maxSize: options.max_size ?? null,
      minSize: options.min_size ?? null,
      searchPath: options.search_path,
    };
  }

  export function currentSearchOptionsForSmartFolder(pane: PaneId = activePaneId()): SearchOptions {
    const session = sessionForPane(pane);
    return toSearchCommandOptions({
      currentPath: session.path,
      options: (session.search.options ?? {}) as SearchWorkflowOptions,
      query: session.search.query,
      showHiddenFiles: session.showHiddenFiles,
    });
  }

  export async function loadSmartFoldersFlow() {
    try {
      appState.smartFolders = await loadSmartFolders();
    } catch (error) {
      showError(error);
    }
  }

  export async function saveCurrentSearchAsSmartFolderFlow(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    const query = String(session.search.query || '').trim();
    if (!session.search.searchMode || !query) {
      showError('Run a search before saving a smart folder.');
      return;
    }

    const result = await showHtmlDialog({
      bodyHtml: `
        <div class="form-group">
          <label class="form-label" for="smart-folder-name">Name</label>
          <input
            id="smart-folder-name"
            class="form-input input-full"
            autocomplete="off"
            value="${escapeHtml(query)}"
          >
        </div>
      `,
      confirmText: 'Save',
      onConfirm: () => (document.getElementById('smart-folder-name') as HTMLInputElement | null)?.value?.trim() || '',
      title: 'Save Smart Folder',
    });

    if (result === false) return;

    const name = typeof result === 'string' ? result.trim() : '';
    if (!name) {
      showError('Enter a smart folder name.');
      return;
    }

    const folder: SmartFolder = {
      icon: '\u2315',
      id: uniqueId('smart-folder'),
      name,
      search_options: currentSearchOptionsForSmartFolder(pane),
    };

    try {
      appState.smartFolders = await saveSmartFolder(folder);
      showSuccess(`Saved smart folder "${folder.name}"`);
    } catch (error) {
      showError(error);
    }
  }

  export async function openSmartFolderFlow(folder: SmartFolder | null | undefined) {
    const options = folder?.search_options;
    const query = String(options?.query || '').trim();
    if (!folder || !options || !query) {
      showError('This smart folder is missing search options.');
      return;
    }

    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    if (searchInput) searchInput.value = query;
    await runSearch(query, searchOptionsToWorkflowOptions(options));
  }

  export async function deleteSmartFolderFlow(id: string | null | undefined) {
    if (!id) return;

    const folder = (appState.smartFolders || []).find((item: SmartFolder) => item.id === id);
    try {
      appState.smartFolders = await deleteSmartFolder(id);
      showSuccess(folder ? `Removed smart folder "${folder.name}"` : 'Removed smart folder');
    } catch (error) {
      showError(error);
    }
  }

  export function restoreDirectoryEntriesAfterSearch(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    if (session.search.savedEntries) {
      session.entries = session.search.savedEntries;
    }
    session.search.savedEntries = null;
  }

  export async function clearSearch(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    if (session.search.currentSearchId) {
      try {
        await cancelSearch(session.search.currentSearchId);
      } catch {
        // The backend may already have finished the search.
      }
    }

    restoreDirectoryEntriesAfterSearch(pane);
    session.search = createPaneSearchState();
    if (pane === activePaneId()) {
      const input = document.getElementById('search-input') as HTMLInputElement | null;
      if (input) input.value = '';
      setSearchControlsVisible();
    }
    renderSearchHeader(pane);
    applyPaneFilters(pane);
    selectPanePaths(pane, []);
  }

  export async function runSearch(query: string, options: SearchWorkflowOptions = {}, pane: PaneId = activePaneId()) {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      await clearSearch(pane);
      return;
    }

    const session = sessionForPane(pane);
    const searchId = `search-${Date.now()}`;
    if (!session.search.searchMode) {
      session.search.savedEntries = session.entries;
    }

    session.search.currentSearchId = searchId;
    session.search.query = cleanQuery;
    session.search.options = { ...options } as Record<string, unknown>;
    session.search.searchMode = true;
    session.search.isSearching = true;
    session.filterQuery = '';
    session.selectedEntries = new Set();
    rememberRecentSearch(cleanQuery);
    if (pane === activePaneId()) setSearchControlsVisible({ clear: true, cancel: true });

    try {
      const results = await searchFiles(toSearchCommandOptions({
        currentPath: session.path,
        options,
        query: cleanQuery,
        searchId,
        showHiddenFiles: session.showHiddenFiles,
      }));
      if (session.search.currentSearchId !== searchId) return;

      const entries = results.map(searchResultToFileEntry);
      session.search.results = entries;
      session.entries = entries;
      session.filteredEntries = visibleEntries(entries, {
        showHidden: session.showHiddenFiles,
        sortAsc: session.sortAsc,
        sortBy: session.sortBy,
      });
      if (pane === activePaneId()) updateStatusBar();
      renderSearchHeader(pane);
    } catch (error) {
      showError(error);
    } finally {
      if (session.search.currentSearchId === searchId) {
        session.search.currentSearchId = null;
        session.search.isSearching = false;
        if (pane === activePaneId()) setSearchControlsVisible({ clear: true, cancel: false });
      }
    }
  }

  export async function openAdvancedSearchFlow() {
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    const result = await showHtmlDialog({
      bodyHtml: renderAdvancedSearchDialog({
        escapeHtml,
        includeHidden: sessionForPane().showHiddenFiles,
        initialQuery: searchInput?.value || sessionForPane().search.query || '',
        recentSearches: getRecentSearches(),
      }),
      confirmText: 'Search',
      onConfirm: () => ({
        options: readAdvancedSearchOptions(document),
        query: (document.getElementById('advanced-search-query') as HTMLInputElement | null)?.value?.trim() || '',
      }),
      title: 'Advanced Search',
    });
    if (!result || typeof result !== 'object') return;

    const { options, query } = result as { options: SearchWorkflowOptions; query: string };
    if (searchInput) searchInput.value = query;
    await runSearch(query, options);
  }

  export async function showPropertiesFlow() {
    const activePane = activePaneId();
    if (selectedSetForPane(activePane).size !== 1) return;
    const selectedPath = currentSelectionPaths()[0];
    const fallbackEntry = findEntryInPane(activePane, selectedPath);
    if (!selectedPath || !fallbackEntry) return;

    try {
      const info = await getEntryInfo(selectedPath).catch(() => fallbackEntry);
      const extension = String(info.extension || info.name.split('.').pop() || '').toLowerCase();
      const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']);
      const isImage = !info.is_dir && imageExts.has(extension);
      const permissionsRow = info.permissions && typeof info.mode === 'number'
        ? `<span class="prop-label">Permissions</span>
           <div class="prop-value" style="display: flex; flex-direction: column;">
             <div style="display: grid; grid-template-columns: max-content max-content max-content max-content; gap: 4px 16px; align-items: center; margin-bottom: 8px;">
               <div></div><div style="font-weight: 500; font-size: 0.85em; text-align: center;">Read</div><div style="font-weight: 500; font-size: 0.85em; text-align: center;">Write</div><div style="font-weight: 500; font-size: 0.85em; text-align: center;">Execute</div>
               
               <div style="font-weight: 500; font-size: 0.85em;">Owner</div>
               <div style="text-align: center;"><input type="checkbox" class="perm-cb" data-mask="256" ${info.mode & 256 ? 'checked' : ''}></div>
               <div style="text-align: center;"><input type="checkbox" class="perm-cb" data-mask="128" ${info.mode & 128 ? 'checked' : ''}></div>
               <div style="text-align: center;"><input type="checkbox" class="perm-cb" data-mask="64" ${info.mode & 64 ? 'checked' : ''}></div>

               <div style="font-weight: 500; font-size: 0.85em;">Group</div>
               <div style="text-align: center;"><input type="checkbox" class="perm-cb" data-mask="32" ${info.mode & 32 ? 'checked' : ''}></div>
               <div style="text-align: center;"><input type="checkbox" class="perm-cb" data-mask="16" ${info.mode & 16 ? 'checked' : ''}></div>
               <div style="text-align: center;"><input type="checkbox" class="perm-cb" data-mask="8" ${info.mode & 8 ? 'checked' : ''}></div>

               <div style="font-weight: 500; font-size: 0.85em;">Others</div>
               <div style="text-align: center;"><input type="checkbox" class="perm-cb" data-mask="4" ${info.mode & 4 ? 'checked' : ''}></div>
               <div style="text-align: center;"><input type="checkbox" class="perm-cb" data-mask="2" ${info.mode & 2 ? 'checked' : ''}></div>
               <div style="text-align: center;"><input type="checkbox" class="perm-cb" data-mask="1" ${info.mode & 1 ? 'checked' : ''}></div>
             </div>
             <div style="font-family: monospace; font-size: 0.9em; opacity: 0.7;">
               Octal Mode: <span id="prop-perms-text">${(info.mode & 0o777).toString(8).padStart(3, '0')}</span>
             </div>
           </div>`
        : info.permissions
          ? `<span class="prop-label">Permissions</span><span class="prop-value prop-permissions">${escapeHtml(info.permissions)}</span>`
          : '';

      const ownerRow = typeof info.uid === 'number' && typeof info.gid === 'number'
        ? `<span class="prop-label">Owner</span>
           <div class="prop-value" style="display: flex; align-items: center; gap: 8px;">
             <label style="font-size: 0.85em; display: flex; align-items: center; gap: 4px;">UID: <input type="number" id="prop-uid-input" value="${info.uid}" style="width: 50px; padding: 2px 4px; font-size: 1em; background: var(--bg-primary, #fff); border: 1px solid var(--border-color, #ccc); color: inherit; border-radius: 4px;"></label>
             <label style="font-size: 0.85em; display: flex; align-items: center; gap: 4px;">GID: <input type="number" id="prop-gid-input" value="${info.gid}" style="width: 50px; padding: 2px 4px; font-size: 1em; background: var(--bg-primary, #fff); border: 1px solid var(--border-color, #ccc); color: inherit; border-radius: 4px;"></label>
             <button id="btn-save-chown" class="tool-btn" style="padding: 2px 8px; font-size: 0.85em;">Apply</button>
           </div>`
        : '';

      const symlinkRow = info.is_symlink
        ? `<span class="prop-label">Symlink target</span><span class="prop-value">${escapeHtml(info.symlink_target || '(unknown)')}</span>`
        : '';
      const checksumRows = info.is_dir ? '' : `
          <span class="prop-label">MD5</span><span class="prop-value prop-hash" id="prop-md5">Computing...</span>
          <span class="prop-label">SHA-1</span><span class="prop-value prop-hash" id="prop-sha1">Computing...</span>
          <span class="prop-label">SHA-256</span><span class="prop-value prop-hash" id="prop-sha256">Computing...</span>
        `;
      const imageRows = isImage ? `
          <span class="prop-label">Dimensions</span><span class="prop-value" id="prop-dimensions">Computing...</span>
          <span class="prop-label">EXIF</span><span class="prop-value" id="prop-exif">Computing...</span>
        ` : '';

      const dialogPromise = showHtmlDialog({
        bodyHtml: `
          <div class="properties-grid">
            <span class="prop-label">Name</span><span class="prop-value">${escapeHtml(info.name)}</span>
            <span class="prop-label">Path</span><span class="prop-value">${escapeHtml(info.path)}</span>
            <span class="prop-label">Type</span><span class="prop-value">${escapeHtml(fileType(info))}</span>
            <span class="prop-label">Size</span><span class="prop-value">${escapeHtml(formatFileSize(info.size, info.is_dir) || 'Folder')}</span>
            <span class="prop-label">Modified</span><span class="prop-value">${escapeHtml(formatModified(info.modified))}</span>
            ${ownerRow}
            ${permissionsRow}
            ${symlinkRow}
            ${imageRows}
            ${checksumRows}
          </div>
        `,
        confirmText: 'Close',
        showCancel: false,
        title: 'Properties',
      });

      const permCheckboxes = document.querySelectorAll('.perm-cb');
      permCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
          let newMode = 0;
          permCheckboxes.forEach((box: any) => {
            if (box.checked) {
              newMode |= parseInt(box.dataset.mask, 10);
            }
          });
          chmodFile(info.path, newMode).then(() => {
            setElementText('prop-perms-text', newMode.toString(8).padStart(3, '0'));
            info.mode = (info.mode! & ~0o777) | newMode;
          }).catch(showError);
        });
      });

      const btnSaveChown = document.getElementById('btn-save-chown');
      if (btnSaveChown) {
        btnSaveChown.addEventListener('click', () => {
          const uidInput = document.getElementById('prop-uid-input') as HTMLInputElement;
          const gidInput = document.getElementById('prop-gid-input') as HTMLInputElement;
          const uid = parseInt(uidInput?.value, 10);
          const gid = parseInt(gidInput?.value, 10);
          if (!isNaN(uid) && !isNaN(gid)) {
            chownFile(info.path, uid, gid).then(() => {
              showSuccess(`Ownership updated to UID: ${uid}, GID: ${gid}`);
              info.uid = uid;
              info.gid = gid;
            }).catch(showError);
          }
        });
      }

      if (!info.is_dir) {
        computeChecksum(info.path).then((hashes) => {
          setElementText('prop-md5', hashes.md5);
          setElementText('prop-sha1', hashes.sha1);
          setElementText('prop-sha256', hashes.sha256);
        }).catch(() => {
          setElementText('prop-md5', 'Unavailable');
          setElementText('prop-sha1', 'Unavailable');
          setElementText('prop-sha256', 'Unavailable');
        });
      }

      if (isImage) {
        getImageMetadata(info.path).then((meta) => {
          setElementText('prop-dimensions', `${meta.width} x ${meta.height}`);
          const exifElement = document.getElementById('prop-exif');
          if (!exifElement) return;

          if (!Array.isArray(meta.exif) || meta.exif.length === 0) {
            exifElement.textContent = 'None';
            return;
          }

          const grid = document.createElement('div');
          grid.className = 'exif-grid';
          for (const [tag, value] of meta.exif) {
            const tagElement = document.createElement('span');
            tagElement.className = 'exif-tag';
            tagElement.textContent = tag;
            const valueElement = document.createElement('span');
            valueElement.className = 'exif-value';
            valueElement.textContent = value;
            grid.append(tagElement, valueElement);
          }
          exifElement.replaceChildren(grid);
        }).catch(() => {
          setElementText('prop-dimensions', 'Unavailable');
          setElementText('prop-exif', 'Unavailable');
        });
      }

      await dialogPromise;
    } catch (error) {
      showError(error);
    }
  }

  export function resetSearchStateForNavigation(pane: PaneId = activePaneId()) {
    const session = sessionForPane(pane);
    session.search = createPaneSearchState();
    renderSearchHeader(pane);
    if (pane === activePaneId()) {
      setSearchControlsVisible();
      const input = document.getElementById('search-input') as HTMLInputElement | null;
      if (input) input.value = '';
    }
  }
