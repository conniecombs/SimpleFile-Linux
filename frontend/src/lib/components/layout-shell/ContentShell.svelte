<script lang="ts">
  import { onDestroy } from 'svelte';
  // @ts-ignore
  import { state as appState } from '../../app/state.svelte.ts';
  import FileListHeader from './FileListHeader.svelte';
  import FileList from '../file-list/FileList.svelte';
  import PaneHeader from './PaneHeader.svelte';
  import type { PaneId } from '../../paneSession';

  const PANE_MIN_PERCENT = 20;
  const PANE_MAX_PERCENT = 80;

  let contentArea: HTMLDivElement | undefined = $state();
  let panePrimary: HTMLDivElement | undefined = $state();
  let paneSecondary: HTMLDivElement | undefined = $state();
  let paneResizing = $state(false);
  let panePercent = $state(50);
  let cleanupPaneResize: (() => void) | undefined;

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function setPaneWidths(nextPrimaryWidth: number) {
    if (!panePrimary || !paneSecondary) {
      return;
    }

    const primaryWidth = clamp(nextPrimaryWidth, PANE_MIN_PERCENT, PANE_MAX_PERCENT);
    panePercent = Math.round(primaryWidth);
    panePrimary.style.width = `${primaryWidth}%`;
    paneSecondary.style.width = `${100 - primaryWidth}%`;
  }

  function currentPanePercent() {
    const inlineWidth = Number.parseFloat(panePrimary?.style.width ?? '');
    if (Number.isFinite(inlineWidth)) {
      return inlineWidth;
    }

    if (!contentArea || !panePrimary) {
      return panePercent;
    }

    const contentRect = contentArea.getBoundingClientRect();
    const primaryRect = panePrimary.getBoundingClientRect();
    if (contentRect.width <= 0) {
      return panePercent;
    }

    return (primaryRect.width / contentRect.width) * 100;
  }

  function handlePaneKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 5;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPaneWidths(currentPanePercent() - step);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPaneWidths(currentPanePercent() + step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setPaneWidths(PANE_MIN_PERCENT);
    } else if (event.key === 'End') {
      event.preventDefault();
      setPaneWidths(PANE_MAX_PERCENT);
    }
  }

  function activatePaneFromEvent(pane: PaneId) {
    document.dispatchEvent(new CustomEvent('simplefile:pane-activate', {
      bubbles: true,
      detail: { pane },
    }));
  }

  function beginPaneResize(event: MouseEvent) {
    if (!contentArea || !panePrimary || !paneSecondary) {
      return;
    }

    event.preventDefault();
    cleanupPaneResize?.();
    paneResizing = true;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function handleMove(moveEvent: MouseEvent) {
      if (!contentArea || !panePrimary || !paneSecondary) {
        return;
      }

      const rect = contentArea.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const percent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setPaneWidths(percent);
    }

    function stopResize() {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', stopResize);
      window.removeEventListener('blur', stopResize);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      paneResizing = false;
      cleanupPaneResize = undefined;
    }

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', stopResize);
    window.addEventListener('blur', stopResize);
    cleanupPaneResize = stopResize;
  }

  onDestroy(() => {
    cleanupPaneResize?.();
  });
</script>

<div bind:this={contentArea} class:dual-pane={appState.dualPaneEnabled} class="content-area" id="content-area">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={panePrimary}
    class:active={appState.activePane === 'primary'}
    class="pane primary-pane"
    id="pane-primary"
    data-pane="primary"
    role="region"
    aria-label="Primary file pane"
    onmousedown={() => activatePaneFromEvent('primary')}
  >
    {#if appState.dualPaneEnabled}
      <PaneHeader pane="primary" />
    {/if}
    <div class="file-container">
      {#if !appState.panes.primary.isGridView}
        <FileListHeader pane="primary" />
      {/if}
      <div
        class="quick-filter-bar"
        id="quick-filter-bar"
        class:visible={Boolean(appState.panes.primary.filterOpen || appState.panes.primary.filterQuery)}
        role="search"
        aria-label="Quick filter"
        hidden={!(appState.panes.primary.filterOpen || appState.panes.primary.filterQuery)}
      >
        <span class="quick-filter-icon" aria-hidden="true">🔎</span>
        <input
          type="text"
          id="filter-input"
          class="quick-filter-input"
          placeholder="Filter files… (Escape to clear)"
          aria-label="Filter current directory"
          value={appState.panes.primary.filterQuery}
          oninput={(event) => event.currentTarget.dispatchEvent(new CustomEvent('simplefile:quick-filter-input', {
            bubbles: true,
            detail: { pane: 'primary', query: (event.currentTarget as HTMLInputElement).value },
          }))}
          onkeydown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.dispatchEvent(new CustomEvent('simplefile:quick-filter-clear', {
                bubbles: true,
                detail: { pane: 'primary' },
              }));
            }
          }}
        />
        <span class="quick-filter-count" id="filter-count"></span>
        <button
          class="quick-filter-clear"
          id="filter-clear"
          title="Clear filter (Escape)"
          aria-label="Clear filter"
          onclick={(event) => event.currentTarget.dispatchEvent(new CustomEvent('simplefile:quick-filter-clear', {
            bubbles: true,
            detail: { pane: 'primary' },
          }))}
        >✕</button>
      </div>
      <FileList pane="primary" />
    </div>
  </div>

  <button
    class:dragging={paneResizing}
    class="pane-divider"
    id="pane-divider"
    type="button"
    aria-label="Resize file panes"
    title="Resize file panes"
    onmousedown={beginPaneResize}
    onkeydown={handlePaneKeydown}
  ></button>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={paneSecondary}
    class:active={appState.activePane === 'secondary'}
    class="pane secondary-pane"
    id="pane-secondary"
    data-pane="secondary"
    role="region"
    aria-label="Secondary file pane"
    onmousedown={() => activatePaneFromEvent('secondary')}
  >
    <PaneHeader pane="secondary" />

    <div class="file-container">
      {#if !appState.panes.secondary.isGridView}
        <FileListHeader pane="secondary" />
      {/if}
      <div
        class="quick-filter-bar"
        class:visible={Boolean(appState.panes.secondary.filterOpen || appState.panes.secondary.filterQuery)}
        role="search"
        aria-label="Secondary quick filter"
        hidden={!(appState.panes.secondary.filterOpen || appState.panes.secondary.filterQuery)}
      >
        <span class="quick-filter-icon" aria-hidden="true">🔎</span>
        <input
          type="text"
          id="secondary-filter-input"
          class="quick-filter-input"
          placeholder="Filter files… (Escape to clear)"
          aria-label="Filter secondary directory"
          value={appState.panes.secondary.filterQuery}
          oninput={(event) => event.currentTarget.dispatchEvent(new CustomEvent('simplefile:quick-filter-input', {
            bubbles: true,
            detail: { pane: 'secondary', query: (event.currentTarget as HTMLInputElement).value },
          }))}
          onkeydown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.dispatchEvent(new CustomEvent('simplefile:quick-filter-clear', {
                bubbles: true,
                detail: { pane: 'secondary' },
              }));
            }
          }}
        />
        <button
          class="quick-filter-clear"
          title="Clear filter (Escape)"
          aria-label="Clear secondary filter"
          onclick={(event) => event.currentTarget.dispatchEvent(new CustomEvent('simplefile:quick-filter-clear', {
            bubbles: true,
            detail: { pane: 'secondary' },
          }))}
        >✕</button>
      </div>
      <FileList pane="secondary" />
    </div>
  </div>

  <aside class:visible={appState.showPreviewPane} class="preview-pane" id="preview-pane">
    <div class="resize-handle" id="preview-resizer"></div>
    <div class="preview-header">
      <span>Preview</span>
      <button
        class="preview-close"
        id="preview-close"
        type="button"
        aria-label="Close preview pane"
        onclick={() => {
          document.dispatchEvent(new CustomEvent('simplefile:preview-close'));
        }}
      >&times;</button>
    </div>
    <div class="preview-content" id="preview-content">
      <div class="preview-placeholder">
        <span class="icon">👁️</span>
        <span>Select a file to preview</span>
      </div>
    </div>
    <div class="preview-info" id="preview-info"></div>
  </aside>
</div>
