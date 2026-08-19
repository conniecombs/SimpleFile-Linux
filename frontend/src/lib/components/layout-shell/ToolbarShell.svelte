<script lang="ts">
  // @ts-ignore
  import { state as appState } from '../../app/state.svelte.ts';
  import BreadcrumbTrail from '../breadcrumb/BreadcrumbTrail.svelte';
  import type { BreadcrumbSegment } from '../breadcrumb/BreadcrumbTrail.svelte';
  import { breadcrumbSegments } from '../../paneSession';

  type ToolbarCommand =
    | 'back'
    | 'clipboard-history'
    | 'disk-cleanup'
    | 'find-duplicates'
    | 'dual-pane'
    | 'folder-metrics'
    | 'forward'
    | 'hidden-toggle'
    | 'new-file'
    | 'new-folder'
    | 'preview-toggle'
    | 'redo'
    | 'refresh'
    | 'terminal'
    | 'theme-toggle'
    | 'undo'
    | 'up'
    | 'view-toggle';

  let moreActionsWrapper: HTMLDivElement | undefined = $state();
  let searchInputElement: HTMLInputElement | undefined = $state();
  let pathInputElement: HTMLInputElement | undefined = $state();
  let isMoreActionsOpen = $state(false);
  let activeSession = $derived(appState.panes?.[appState.activePane === 'secondary' ? 'secondary' : 'primary'] || appState.panes?.primary);
  let activeSelection = $derived(activeSession?.selectedEntries || new Set());
  let activeEntries = $derived(activeSession?.filteredEntries || []);
  let hasRedo = $derived((appState.redoStack || []).some((entry: any) => typeof entry?.redo === 'function'));
  let hasUndo = $derived((appState.undoStack?.length || 0) > 0);
  let hasFolderSelection = $derived.by(() => {
    const selectedPaths = new Set(activeSelection);
    return activeEntries.some((entry: any) => selectedPaths.has(entry.path) && entry.is_dir);
  });
  let isSearching = $derived(Boolean(activeSession?.search?.isSearching || activeSession?.search?.searchMode));

  let pathSegments = $derived(breadcrumbSegments(activeSession?.path || '') as BreadcrumbSegment[]);
  let canGoBack = $derived((activeSession?.historyIndex || 0) > 0);
  let canGoForward = $derived((activeSession?.historyIndex || -1) < (activeSession?.history?.length || 0) - 1);

  $effect(() => {
    const path = activeSession?.path || '';
    if (pathInputElement && document.activeElement !== pathInputElement) {
      pathInputElement.value = path;
    }
  });

  $effect(() => {
    const query = activeSession?.search?.query || '';
    if (searchInputElement && document.activeElement !== searchInputElement) {
      searchInputElement.value = query;
    }
  });

  const SEARCH_CANCEL_EVENT = 'simplefile:search-cancel';
  const SEARCH_CLEAR_EVENT = 'simplefile:search-clear';
  const SEARCH_OPEN_ADVANCED_EVENT = 'simplefile:search-open-advanced';
  const SEARCH_SUBMIT_EVENT = 'simplefile:search-submit';
  const TOOLBAR_COMMAND_EVENT = 'simplefile:toolbar-command';
  const TOOLBAR_ICON_SIZE_EVENT = 'simplefile:toolbar-icon-size';

  function setMoreActionsOpen(open: boolean) {
    isMoreActionsOpen = open;
  }

  function toggleMoreActions(event: MouseEvent) {
    event.stopPropagation();
    setMoreActionsOpen(!isMoreActionsOpen);
  }

  function closeMoreActions() {
    setMoreActionsOpen(false);
  }

  function emitFromTarget(type: string, event: Event, detail = {}) {
    event.currentTarget?.dispatchEvent(new CustomEvent(type, {
      bubbles: true,
      detail,
    }));
  }

  function emitToolbarCommand(event: MouseEvent, command: ToolbarCommand) {
    emitFromTarget(TOOLBAR_COMMAND_EVENT, event, { command });
  }

  function emitMoreActionCommand(event: MouseEvent, command: ToolbarCommand) {
    emitToolbarCommand(event, command);
    closeMoreActions();
  }

  function emitIconSize(event: Event, commit = false) {
    const target = event.currentTarget as HTMLInputElement | null;
    emitFromTarget(TOOLBAR_ICON_SIZE_EVENT, event, {
      commit,
      value: Number(target?.value || 0),
    });
  }

  function currentSearchQuery() {
    return searchInputElement?.value?.trim() || '';
  }

  function emitSearchSubmit(event: MouseEvent | KeyboardEvent) {
    emitFromTarget(SEARCH_SUBMIT_EVENT, event, { query: currentSearchQuery() });
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      emitSearchSubmit(event);
      return;
    }

    if (event.key === 'Escape') {
      emitFromTarget(SEARCH_CLEAR_EVENT, event);
    }
  }

  $effect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && moreActionsWrapper?.contains(target)) {
        return;
      }
      setMoreActionsOpen(false);
    }

    function handleDocumentKeydown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !isMoreActionsOpen) {
        return;
      }

      setMoreActionsOpen(false);
      document.getElementById('btn-more-actions')?.focus();
    }

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);

    return () => {
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleDocumentKeydown);
    };
  });
</script>

<header class="toolbar" role="toolbar" aria-label="Navigation and actions">
  <div class="toolbar-nav" role="group" aria-label="Navigation">
    <button class="toolbar-btn" id="btn-back" title="Go Back" aria-label="Go back" disabled={!canGoBack} onclick={(event) => emitToolbarCommand(event, 'back')}>
      <span class="icon" aria-hidden="true">◀</span>
    </button>
    <button class="toolbar-btn" id="btn-forward" title="Go Forward" aria-label="Go forward" disabled={!canGoForward} onclick={(event) => emitToolbarCommand(event, 'forward')}>
      <span class="icon" aria-hidden="true">▶</span>
    </button>
    <button class="toolbar-btn" id="btn-up" title="Go Up" aria-label="Go to parent folder" onclick={(event) => emitToolbarCommand(event, 'up')}>
      <span class="icon" aria-hidden="true">▲</span>
    </button>
    <button class="toolbar-btn" id="btn-refresh" title="Refresh" aria-label="Refresh current folder" onclick={(event) => emitToolbarCommand(event, 'refresh')}>
      <span class="icon" aria-hidden="true">🔄</span>
    </button>
  </div>

  <div class="path-bar" id="path-bar" role="navigation" aria-label="Breadcrumb navigation">
    <BreadcrumbTrail segments={pathSegments} />
    <input bind:this={pathInputElement} type="text" id="path-input" class="path-input" placeholder="Enter path..." autocomplete="off" value={activeSession?.path || ''} />
    <div class="path-autocomplete" id="path-autocomplete" role="listbox" aria-label="Path suggestions" style="display:none;"></div>
  </div>

  <div class:searching={isSearching} class="search-bar search-field" role="search">
    <button class="search-field-btn" id="search-btn" type="button" title="Search" aria-label="Start search" onclick={emitSearchSubmit}>🔍</button>
    <input bind:this={searchInputElement} type="text" id="search-input" class="search-input" placeholder="Search files…" aria-label="Search files" onkeydown={handleSearchKeydown} />
    <button class="search-field-btn" id="search-advanced" type="button" title="Advanced Search" aria-label="Advanced search options" onclick={(event) => emitFromTarget(SEARCH_OPEN_ADVANCED_EVENT, event)}>
      <svg class="search-advanced-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 7h10" />
        <path d="M18 7h2" />
        <path d="M4 17h2" />
        <path d="M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </svg>
    </button>
    {#if activeSession?.search?.isSearching}
      <button class="search-clear-btn" id="search-cancel" type="button" title="Cancel Search" aria-label="Cancel search" onclick={(event) => emitFromTarget(SEARCH_CANCEL_EVENT, event)}>■</button>
    {/if}
    {#if activeSession?.search?.searchMode && !activeSession?.search?.isSearching}
      <button class="search-clear-btn" id="search-clear" type="button" title="Clear Search" aria-label="Clear search results" onclick={(event) => emitFromTarget(SEARCH_CLEAR_EVENT, event)}>✕</button>
    {/if}
  </div>

  <div class="toolbar-actions" role="group" aria-label="View and tools">
    <button class="toolbar-btn" id="btn-view-toggle" title="Toggle View (List/Grid)" aria-label="Toggle between list and grid view" aria-pressed={Boolean(activeSession?.isGridView)} onclick={(event) => emitToolbarCommand(event, 'view-toggle')}>
      <span class="icon" aria-hidden="true">{activeSession?.isGridView ? '▦' : '☰'}</span>
    </button>
    <button class="toolbar-btn" id="btn-dual-pane" title="Dual Pane (F6)" aria-label="Toggle dual pane view" aria-pressed={appState.dualPaneEnabled} data-active={appState.dualPaneEnabled} onclick={(event) => emitToolbarCommand(event, 'dual-pane')}>
      <span class="icon" aria-hidden="true">▯▯</span>
    </button>
    <button class="toolbar-btn" id="btn-preview-toggle" title="Preview Pane" aria-label="Toggle preview pane" aria-pressed={appState.showPreviewPane} data-active={appState.showPreviewPane} onclick={(event) => emitToolbarCommand(event, 'preview-toggle')}>
      <span class="icon" aria-hidden="true">◧</span>
    </button>
    <div class="more-actions-wrapper" bind:this={moreActionsWrapper}>
      <button
        class="toolbar-btn"
        id="btn-more-actions"
        title="View and tools"
        aria-label="View and tools"
        aria-haspopup="true"
        aria-expanded={isMoreActionsOpen}
        onclick={toggleMoreActions}
      >
        <span class="icon" aria-hidden="true">⋯</span>
      </button>
      <div
        class:open={isMoreActionsOpen}
        class="more-actions-dropdown"
        id="more-actions-dropdown"
        role="menu"
        aria-label="View and tools"
        tabindex="-1"
      >
        <div class="more-actions-group">
          <div class="more-actions-section-header">View</div>
          <button class="more-actions-item toolbar-btn" id="btn-hidden-toggle" title="Toggle Hidden Files (Ctrl+H)" aria-label="Toggle hidden files" data-active={Boolean(activeSession?.showHiddenFiles)} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'hidden-toggle')}>
            <span class="icon" aria-hidden="true">👁</span>
            <span class="more-actions-label">Hidden Files</span>
            <span class="more-actions-shortcut">Ctrl+H</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-theme-toggle" title="Toggle Theme" aria-label="Toggle dark/light theme" data-active={appState.theme === 'light'} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'theme-toggle')}>
            <span class="icon" aria-hidden="true">🌙</span>
            <span class="more-actions-label">{appState.theme === 'light' ? 'Dark Theme' : 'Light Theme'}</span>
          </button>
          {#if activeSession?.isGridView}
            <div class="more-actions-row icon-size-control" id="icon-size-control">
              <span class="icon" aria-hidden="true">⊞</span>
              <span class="more-actions-label">Icon Size</span>
              <input type="range" id="icon-size-slider" min="48" max="128" value={appState.iconSize} title="Icon Size" aria-label="Adjust icon size" oninput={(event) => emitIconSize(event)} onchange={(event) => emitIconSize(event, true)} />
            </div>
          {/if}
        </div>
        <div class="more-actions-divider" role="separator"></div>
        <div class="more-actions-group">
          <div class="more-actions-section-header">Create</div>
          <button class="more-actions-item toolbar-btn" id="btn-new-folder" title="New Folder (Ctrl+N)" aria-label="Create new folder" role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'new-folder')}>
            <span class="icon" aria-hidden="true">📁</span>
            <span class="more-actions-label">New Folder</span>
            <span class="more-actions-shortcut">Ctrl+N</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-new-file" title="New File (Ctrl+Shift+N)" aria-label="Create new file" role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'new-file')}>
            <span class="icon" aria-hidden="true">📄</span>
            <span class="more-actions-label">New File</span>
            <span class="more-actions-shortcut">Ctrl+Shift+N</span>
          </button>
        </div>
        <div class="more-actions-divider" role="separator"></div>
        <div class="more-actions-group">
          <div class="more-actions-section-header">Tools</div>
          <button class="more-actions-item toolbar-btn" id="btn-terminal" title="Open Terminal Here (F4)" aria-label="Open terminal in current folder" role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'terminal')}>
            <span class="icon" aria-hidden="true">💻</span>
            <span class="more-actions-label">Open Terminal</span>
            <span class="more-actions-shortcut">F4</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-folder-metrics" title="Calculate Folder Metrics" aria-label="Calculate selected folder size and item count" disabled={!hasFolderSelection} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'folder-metrics')}>
            <span class="icon" aria-hidden="true">S</span>
            <span class="more-actions-label">Folder Metrics</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-disk-cleanup" title="Analyze Cleanup" aria-label="Analyze large and duplicate files in this folder" disabled={appState.cleanupInProgress} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'disk-cleanup')}>
            <span class="icon" aria-hidden="true">C</span>
            <span class="more-actions-label">Analyze Cleanup</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-find-duplicates" title="Find Duplicates (Ctrl+Shift+D)" aria-label="Find duplicate files in this folder" disabled={appState.cleanupInProgress} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'find-duplicates')}>
            <span class="icon" aria-hidden="true">⧉</span>
            <span class="more-actions-label">Find Duplicates</span>
            <span class="more-actions-shortcut">Ctrl+Shift+D</span>
          </button>
        </div>
        <div class="more-actions-divider" role="separator"></div>
        <div class="more-actions-group">
          <div class="more-actions-section-header">History</div>
          <button class="more-actions-item toolbar-btn" id="btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!hasUndo} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'undo')}>
            <span class="icon" aria-hidden="true">↩</span>
            <span class="more-actions-label">Undo</span>
            <span class="more-actions-shortcut">Ctrl+Z</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-redo" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!hasRedo} role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'redo')}>
            <span class="icon" aria-hidden="true">↪</span>
            <span class="more-actions-label">Redo</span>
            <span class="more-actions-shortcut">Ctrl+Y</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-clipboard-history" title="Clipboard History (Ctrl+Shift+V)" aria-label="Show clipboard history" role="menuitem" onclick={(event) => emitMoreActionCommand(event, 'clipboard-history')}>
            <span class="icon" aria-hidden="true">📋</span>
            <span class="more-actions-label">Clipboard History</span>
            <span class="more-actions-shortcut">Ctrl+Shift+V</span>
          </button>
        </div>
        <div class="more-actions-divider" role="separator"></div>
        <div class="more-actions-group">
          <button class="more-actions-item toolbar-btn" id="btn-open-settings" title="Settings" aria-label="Open settings" role="menuitem" onclick={(event) => { emitFromTarget('simplefile:open-settings', event); closeMoreActions(); }}>
            <span class="icon" aria-hidden="true">⚙</span>
            <span class="more-actions-label">Settings</span>
          </button>
          <button class="more-actions-item toolbar-btn" id="btn-keyboard-help" title="Keyboard Shortcuts" aria-label="Keyboard shortcuts" role="menuitem" onclick={(event) => { emitFromTarget('simplefile:keyboard-help', event); closeMoreActions(); }}>
            <span class="icon" aria-hidden="true">?</span>
            <span class="more-actions-label">Keyboard Shortcuts</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</header>
