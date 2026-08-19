<script lang="ts">
  // @ts-ignore
  import { state as appState } from '../../app/state.svelte.ts';
  import { breadcrumbSegments, type PaneId } from '../../paneSession';

  let {
    pane,
  }: {
    pane: PaneId;
  } = $props();

  let pathInput: HTMLInputElement | undefined = $state();
  let pathEditing = $state(false);

  let session = $derived(appState.panes[pane]);
  let segments = $derived(breadcrumbSegments(session?.path || ''));
  let canGoBack = $derived((session?.historyIndex || 0) > 0);
  let canGoForward = $derived((session?.historyIndex || -1) < (session?.history?.length || 0) - 1);

  function emitCommand(event: Event, command: string, path = '') {
    event.currentTarget?.dispatchEvent(new CustomEvent('simplefile:pane-command', {
      bubbles: true,
      detail: { command, pane, path },
    }));
  }

  function beginPathEdit(event?: Event) {
    event?.preventDefault();
    pathEditing = true;
    requestAnimationFrame(() => {
      if (!pathInput) return;
      pathInput.value = session?.path || '';
      pathInput.focus();
      pathInput.select();
    });
  }

  function endPathEdit(resetValue = false) {
    if (resetValue && pathInput) {
      pathInput.value = session?.path || '';
    }
    pathEditing = false;
  }

  function handlePathKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      endPathEdit(true);
      return;
    }

    if (event.key !== 'Enter') return;
    const path = (event.currentTarget as HTMLInputElement).value.trim();
    if (!path) return;
    event.preventDefault();
    emitCommand(event, 'navigate', path);
    endPathEdit();
  }
</script>

<div class="pane-header">
  <div class="pane-nav-buttons">
    <button
      class="toolbar-btn pane-nav-btn"
      type="button"
      title="Go Back"
      aria-label={`Go back in ${pane} pane`}
      disabled={!canGoBack}
      onclick={(event) => emitCommand(event, 'back')}
    >
      <span class="icon" aria-hidden="true">◀</span>
    </button>
    <button
      class="toolbar-btn pane-nav-btn"
      type="button"
      title="Go Forward"
      aria-label={`Go forward in ${pane} pane`}
      disabled={!canGoForward}
      onclick={(event) => emitCommand(event, 'forward')}
    >
      <span class="icon" aria-hidden="true">▶</span>
    </button>
    <button
      class="toolbar-btn pane-nav-btn"
      type="button"
      title="Go Up"
      aria-label={`Go to parent folder in ${pane} pane`}
      disabled={!session?.path}
      onclick={(event) => emitCommand(event, 'up')}
    >
      <span class="icon" aria-hidden="true">▲</span>
    </button>
  </div>
  <div
    class:editing={pathEditing}
    class="pane-path-bar"
    role="navigation"
    aria-label={`${pane} path`}
  >
    <div class="breadcrumb" role="list">
      {#each segments as segment, index}
        <span role="listitem">
          <button class="breadcrumb-segment" type="button" onclick={(event) => emitCommand(event, 'navigate', segment.path)}>
            {segment.label}
          </button>
        </span>
        {#if index < segments.length - 1}
          <span class="breadcrumb-separator" aria-hidden="true">/</span>
        {/if}
      {/each}
    </div>
    <button
      class="pane-path-edit-btn"
      type="button"
      title="Edit path"
      aria-label={`Edit ${pane} path`}
      onclick={beginPathEdit}
    >
      <span class="icon" aria-hidden="true">✎</span>
    </button>
    <input
      bind:this={pathInput}
      type="text"
      class="path-input"
      placeholder="Enter path..."
      value={session?.path || ''}
      onblur={() => endPathEdit()}
      onkeydown={handlePathKeydown}
    />
  </div>
</div>
