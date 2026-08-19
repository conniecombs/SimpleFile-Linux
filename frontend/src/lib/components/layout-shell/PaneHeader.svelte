<script lang="ts">
  // @ts-ignore
  import { state as appState } from '../../app/state.svelte.ts';
  import type { PaneId } from '../../paneSession';
  import TabsBar from '../tabs/TabsBar.svelte';

  let {
    pane,
  }: {
    pane: PaneId;
  } = $props();

  let session = $derived(appState.panes[pane]);
  let label = $derived(pane === 'secondary' ? 'Secondary pane tabs' : 'Primary pane tabs');
</script>

<div
  class="pane-header tab-bar"
  role="tablist"
  aria-label={label}
>
  <div class="tabs-container">
    <TabsBar
      pane={pane}
      tabs={session?.tabs || []}
      activeTabId={session?.activeTabId || null}
    />
  </div>
</div>
