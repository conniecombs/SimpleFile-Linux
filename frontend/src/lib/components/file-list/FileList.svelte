<script lang="ts">
  // @ts-ignore
  import { state as appState } from '../../app/state.svelte.ts';
  import { fileType, formatFileSize, formatModified } from '../../coreFileManager';
  import FileListItems from './FileListItems.svelte';
  import type { FileListViewItem } from './FileListItems.svelte';

  let { pane = 'primary' }: { pane?: 'primary' | 'secondary' } = $props();

  let visibleColumns = $derived(appState.settings?.visibleColumns || ['size', 'date', 'type']);

  function columnWidth(column: string) {
    const width = Number(appState.settings?.columnWidths?.[column] || 0);
    return width > 0 ? `${width}px` : `var(--col-${column}-width)`;
  }

  function fileListColumns() {
    return [
      columnWidth('name'),
      ...visibleColumns.map((column: string) => columnWidth(column)),
    ].join(' ');
  }

  function tagForPath(path: string) {
    const tag = appState.fileTags?.[path];
    if (!tag) return null;
    const label = tag.label || tag.name || 'Label';
    return {
      color: tag.color || '#64748b',
      emoji: tag.emoji || '\u25cf',
      label,
    };
  }

  let displayItems = $derived.by(() => {
    const sourceEntries = pane === 'primary' ? appState.filteredEntries : (appState.secondaryFilteredEntries || []);
    const selectedSet = pane === 'primary' ? appState.selectedEntries : (appState.secondarySelectedEntries || new Set());

    return sourceEntries.map((entry: any, i: number): FileListViewItem => {
      const folderSize = appState.folderSizes?.get(entry.path);
      const sizeText = entry.is_dir && typeof folderSize === 'number'
        ? formatFileSize(folderSize)
        : formatFileSize(entry.size, entry.is_dir);

      return {
        icon: entry.is_dir ? '\u{1f4c1}' : '\u{1f4c4}',
        index: i,
        isCut: false,
        isDir: entry.is_dir,
        isFocused: i === appState.focusedIndex && appState.activePane === pane,
        isImage: entry.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) !== null,
        isPdf: entry.name.toLowerCase().endsWith('.pdf'),
        isSelected: selectedSet.has(entry.path),
        isSymlink: entry.is_symlink,
        itemCount: entry.itemCount || '',
        modified: formatModified(entry.modified),
        name: entry.name,
        path: entry.path,
        size: sizeText,
        tag: tagForPath(entry.path),
        type: fileType(entry),
      };
    });
  });
  let scrollContainer: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);
  let clientHeight = $state(800);
  let clientWidth = $state(800);

  const LIST_ITEM_HEIGHT = 36;
  const GRID_ITEM_HEIGHT = 140;
  const GRID_ITEM_WIDTH = 112;

  let itemsPerRow = $derived.by(() => {
    if (!appState.isGridView) return 1;
    return Math.max(1, Math.floor(clientWidth / (GRID_ITEM_WIDTH + 16)));
  });

  let itemHeight = $derived(appState.isGridView ? GRID_ITEM_HEIGHT : LIST_ITEM_HEIGHT);

  let virtualMath = $derived.by(() => {
    const totalItems = displayItems.length;
    const rows = Math.ceil(totalItems / itemsPerRow);
    const totalHeight = rows * itemHeight;

    const startRow = Math.max(0, Math.floor(scrollTop / itemHeight));
    const visibleRows = Math.ceil(clientHeight / itemHeight) + 4;

    const startIndex = startRow * itemsPerRow;
    const endIndex = Math.min(totalItems, (startRow + visibleRows) * itemsPerRow);
    const offsetY = startRow * itemHeight;

    return {
      visibleItems: displayItems.slice(startIndex, endIndex),
      totalHeight,
      offsetY,
    };
  });
</script>

<div
  bind:this={scrollContainer}
  onscroll={(e) => scrollTop = e.currentTarget.scrollTop}
  bind:clientHeight
  bind:clientWidth
  class="file-list"
  class:list-view={!appState.isGridView}
  class:grid-view={appState.isGridView}
  id={pane === 'primary' ? 'file-list' : 'secondary-file-list'}
  role="listbox"
  aria-label="Files and folders"
  aria-multiselectable="true"
  style={`height: 100%; overflow: auto; --file-list-columns: ${fileListColumns()};`}
>
  <FileListItems
    items={virtualMath.visibleItems}
    isGrid={appState.isGridView}
    {pane}
    visibleColumns={visibleColumns}
    mode="virtual"
    totalHeight={virtualMath.totalHeight}
    offsetY={virtualMath.offsetY}
  />
</div>
