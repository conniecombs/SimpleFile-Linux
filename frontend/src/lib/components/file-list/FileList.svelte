<script lang="ts">
  // @ts-ignore
  import { state as appState } from '../../app/state.svelte.ts';
  import { fileType, formatFileSize, formatModified } from '../../coreFileManager';
  import FileListItems from './FileListItems.svelte';
  import type { FileListViewItem } from './FileListItems.svelte';

  let { pane = 'primary' }: { pane?: 'primary' | 'secondary' } = $props();
  let listLabel = $derived(pane === 'secondary' ? 'Secondary files and folders' : 'Primary files and folders');

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

  let session = $derived(appState.panes?.[pane] || appState.panes?.primary);
  let filteredEntries = $derived(session?.filteredEntries || []);
  let selectedSet = $derived(session?.selectedEntries || new Set());
  let focusedIndex = $derived(session?.focusedIndex ?? -1);
  let isGridView = $derived(Boolean(session?.isGridView));

  let displayItems = $derived.by(() => {
    const sourceEntries = filteredEntries;

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
        isDragging: Boolean((appState.draggedItems || []).includes(entry.path)),
        isFocused: i === focusedIndex && appState.activePane === pane,
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
    if (!isGridView) return 1;
    return Math.max(1, Math.floor(clientWidth / (GRID_ITEM_WIDTH + 16)));
  });

  let itemHeight = $derived(isGridView ? GRID_ITEM_HEIGHT : LIST_ITEM_HEIGHT);

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
  class:list-view={!isGridView}
  class:grid-view={isGridView}
  class:drag-active={appState.isDragging}
  id={pane === 'primary' ? 'file-list' : 'secondary-file-list'}
  role="listbox"
  aria-label={listLabel}
  aria-multiselectable="true"
  style={`height: 100%; overflow: auto; --file-list-columns: ${fileListColumns()};`}
>
  <FileListItems
    items={virtualMath.visibleItems}
    isGrid={isGridView}
    {pane}
    visibleColumns={visibleColumns}
    mode="virtual"
    totalHeight={virtualMath.totalHeight}
    offsetY={virtualMath.offsetY}
  />
</div>
