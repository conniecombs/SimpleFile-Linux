<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  // @ts-ignore
  import { state as appState } from '../../app/state.svelte.ts';
  import { cancelDiskCleanup, findDuplicates, moveToTrash, openFile, revealInFolder } from '../../api';
  import { basename, formatFileSize } from '../../coreFileManager';
  import { showError, showSuccess } from '../toasts';
  import type { DuplicateGroup, PathString } from '../../types';

  type DuplicateGroupView = DuplicateGroup & { keepPath: PathString };

  let open = $state(false);
  let scanning = $state(false);
  let scanPath = $state('');
  let scannedFiles = $state(0);
  let comparedFiles = $state(0);
  let progressLabel = $state('');
  let groups = $state<DuplicateGroupView[]>([]);
  let busyGroup = $state<string | null>(null);

  function pathForCurrentPane(): PathString {
    const pane = appState.activePane === 'secondary' ? 'secondary' : 'primary';
    return appState.panes?.[pane]?.path || '';
  }

  function extraCount(): number {
    return groups.reduce((count, group) => count + Math.max(0, group.files.length - 1), 0);
  }

  function reclaimableBytes(): number {
    return groups.reduce((total, group) => total + group.size * Math.max(0, group.files.length - 1), 0);
  }

  async function scan(): Promise<void> {
    const directory = pathForCurrentPane();
    if (!directory || scanning) return;

    scanning = true;
    scanPath = directory;
    progressLabel = 'Scanning…';
    groups = [];
    try {
      const result = await findDuplicates(directory);
      scannedFiles = result.scanned_files || 0;
      comparedFiles = result.compared_files || 0;
      groups = (result.groups || []).map((group) => ({
        ...group,
        keepPath: group.files[0],
      }));
      progressLabel = groups.length === 0 ? 'No duplicate files found.' : '';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('cancel')) {
        progressLabel = 'Scan cancelled.';
      } else {
        showError(error);
        progressLabel = 'Scan failed.';
      }
    } finally {
      scanning = false;
    }
  }

  async function confirmDelete(paths: PathString[], message: string): Promise<boolean> {
    if (paths.length === 0) return false;
    if (appState.settings?.confirmDelete === false) return true;
    return window.confirm(message);
  }

  async function deletePaths(paths: PathString[], groupHash?: string): Promise<void> {
    if (paths.length === 0) return;
    if (groupHash) busyGroup = groupHash;
    try {
      await moveToTrash(paths);
      const removed = new Set(paths);
      groups = groups
        .map((group) => ({
          ...group,
          files: group.files.filter((path) => !removed.has(path)),
        }))
        .filter((group) => group.files.length > 1)
        .map((group) => ({
          ...group,
          keepPath: group.files.includes(group.keepPath) ? group.keepPath : group.files[0],
        }));
      showSuccess(`Moved ${paths.length} duplicate${paths.length === 1 ? '' : 's'} to trash`);
      document.dispatchEvent(new CustomEvent('simplefile:toolbar-command', { detail: { command: 'refresh' } }));
    } catch (error) {
      showError(error);
    } finally {
      busyGroup = null;
    }
  }

  async function deleteOthers(group: DuplicateGroupView): Promise<void> {
    const extras = group.files.filter((path) => path !== group.keepPath);
    const ok = await confirmDelete(
      extras,
      `Move ${extras.length} duplicate file${extras.length === 1 ? '' : 's'} to trash and keep ${basename(group.keepPath)}?`,
    );
    if (ok) await deletePaths(extras, group.hash);
  }

  async function deleteAllExtras(): Promise<void> {
    const extras: PathString[] = [];
    for (const group of groups) {
      for (const path of group.files) {
        if (path !== group.keepPath) extras.push(path);
      }
    }
    const ok = await confirmDelete(
      extras,
      `Move ${extras.length} extra duplicate file${extras.length === 1 ? '' : 's'} to trash, keeping one file in each group?`,
    );
    if (ok) await deletePaths(extras);
  }

  function openOverlay(): void {
    open = true;
    void scan();
  }

  function closeOverlay(): void {
    if (scanning) void cancelDiskCleanup();
    open = false;
    scanning = false;
  }

  function handleOpenEvent(): void {
    openOverlay();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeOverlay();
    }
  }

  onMount(() => {
    document.addEventListener('simplefile:find-duplicates', handleOpenEvent);
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('simplefile:find-duplicates', handleOpenEvent);
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if open}
  <div class="duplicates-overlay" role="dialog" aria-modal="true" aria-labelledby="duplicates-title">
    <div class="duplicates-panel">
      <header class="duplicates-header">
        <div>
          <h2 id="duplicates-title">Duplicate Files</h2>
          <p class="duplicates-path" title={scanPath}>{scanPath || 'No folder selected'}</p>
        </div>
        <div class="duplicates-header-actions">
          <button class="btn" type="button" disabled={scanning || !pathForCurrentPane()} onclick={() => void scan()}>
            {scanning ? 'Scanning…' : 'Rescan'}
          </button>
          <button class="modal-close" type="button" aria-label="Close duplicates" onclick={closeOverlay}>&times;</button>
        </div>
      </header>

      <div class="duplicates-summary">
        {#if scanning}
          <span>{progressLabel || 'Scanning…'}</span>
        {:else}
          <span>{groups.length} group{groups.length === 1 ? '' : 's'}</span>
          <span>{extraCount()} extra file{extraCount() === 1 ? '' : 's'}</span>
          <span>{formatFileSize(reclaimableBytes())} reclaimable</span>
          <span>{scannedFiles} scanned · {comparedFiles} hashed</span>
        {/if}
      </div>

      <div class="duplicates-body">
        {#if scanning}
          <p class="placeholder-msg">Comparing same-size files with SHA-256…</p>
        {:else if groups.length === 0}
          <p class="placeholder-msg">{progressLabel || 'No duplicate files found in this folder.'}</p>
        {:else}
          {#each groups as group (group.hash)}
            <section class="duplicate-group">
              <div class="duplicate-group-header">
                <strong>{group.files.length} copies</strong>
                <span>{formatFileSize(group.size)}</span>
                <span class="cleanup-hash" title={group.hash}>SHA-256 {group.hash.slice(0, 16)}…</span>
                <button
                  class="btn btn-danger"
                  type="button"
                  disabled={busyGroup === group.hash || group.files.length < 2}
                  onclick={() => void deleteOthers(group)}
                >
                  Keep selected, delete others
                </button>
              </div>
              <ul class="duplicate-file-list">
                {#each group.files as path (path)}
                  <li class="duplicate-file-row">
                    <label>
                      <input
                        type="radio"
                        name={`keep-${group.hash}`}
                        checked={group.keepPath === path}
                        onchange={() => {
                          groups = groups.map((entry) => (
                            entry.hash === group.hash ? { ...entry, keepPath: path } : entry
                          ));
                        }}
                      />
                      <span class="duplicate-file-name" title={path}>{basename(path)}</span>
                    </label>
                    <span class="duplicate-file-path" title={path}>{path}</span>
                    <span class="duplicate-file-actions">
                      <button class="btn-link" type="button" onclick={() => void openFile(path)}>Open</button>
                      <button class="btn-link" type="button" onclick={() => void revealInFolder(path)}>Show</button>
                    </span>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        {/if}
      </div>

      <footer class="duplicates-footer">
        <button class="btn" type="button" onclick={closeOverlay}>Close</button>
        <button
          class="btn btn-danger"
          type="button"
          disabled={scanning || extraCount() === 0}
          onclick={() => void deleteAllExtras()}
        >
          Delete extras in all groups
        </button>
      </footer>
    </div>
  </div>
{/if}
