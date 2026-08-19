import { batchRename, getImageMetadata, listDirectory } from '../api';
import {
  analyzeRenameSelection,
  buildRenamePlans,
  cameraFromExif,
  dateTakenFromExif,
  isImageEntry,
  settingsNeedImageContext,
  type AdvancedRenameFileContext,
  type AdvancedRenamePlan,
  type AdvancedRenameSettings,
  type RenameSource,
} from '../advancedRenameEngine';
import { getParentPath, joinPath, sortEntries } from '../coreFileManager';
import { showUndoableSuccess } from '../components/toasts';
import type { FileEntry, PathString, RenameRequest } from '../types';
// @ts-ignore
import { state as appState } from './state.svelte.ts';
import {
  activePaneId,
  entriesForPane,
  filteredEntriesForPane,
  pathForPane,
  pushUndoEntry,
  refreshPane,
  runWithProgress,
  selectedSetForPane,
  sessionForPane,
  undoLastFlow,
} from './core.js';

export type CollectedRenameTarget = {
  entry: FileEntry;
  parentPath: PathString;
  context?: AdvancedRenameFileContext;
};

function selectedSet(): Set<PathString> {
  return selectedSetForPane();
}

function entriesForActivePane(): FileEntry[] {
  return filteredEntriesForPane();
}

function fallbackParent(): PathString {
  return pathForPane() || '';
}

export function selectedRenameEntries(): FileEntry[] {
  const selected = selectedSet();
  const seen = new Set<PathString>();
  const fromView = entriesForActivePane().filter((entry) => selected.has(entry.path));
  const extras = entriesForPane()
    .filter((entry) => selected.has(entry.path) && !fromView.some((item) => item.path === entry.path));

  return [...fromView, ...extras].filter((entry) => {
    if (seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });
}

export function selectionAnalysis(entries: RenameSource[] = selectedRenameEntries()) {
  return analyzeRenameSelection(entries);
}

export async function collectAdvancedRenameTargets(
  settings: AdvancedRenameSettings,
): Promise<CollectedRenameTarget[]> {
  const selected = selectedRenameEntries();
  const includeRecursive = settings.includeRecursive;
  const includeHidden = settings.includeHidden;
  const renameFolders = settings.renameFolders;
  const session = sessionForPane();
  const sortBy = session.sortBy || 'name';
  const sortAsc = session.sortAsc !== false;
  const targets: CollectedRenameTarget[] = [];
  const seen = new Set<PathString>();

  async function addEntry(entry: FileEntry, explicitlySelected: boolean): Promise<void> {
    if (seen.has(entry.path)) return;
    if (!includeHidden && entry.name.startsWith('.')) return;
    seen.add(entry.path);

    if (!entry.is_dir || renameFolders) {
      targets.push({
        entry,
        parentPath: getParentPath(entry.path) || fallbackParent(),
      });
    } else if (!includeRecursive && explicitlySelected) {
      // Selected folder with neither recursive nor rename-folders stays out of
      // the target list; the dialog explains how to include it.
    }

    if (includeRecursive && entry.is_dir) {
      try {
        const listing = await listDirectory(entry.path);
        const children = sortEntries(listing.entries, sortBy, sortAsc);
        for (const child of children) {
          await addEntry(child, false);
        }
      } catch {
        // Keep the dialog usable even when one subtree cannot be read.
      }
    }
  }

  for (const entry of selected) {
    await addEntry(entry, true);
  }

  return targets;
}

function tagsForPath(path: PathString): { tags: string[]; colorLabel: string } {
  const fileTags = (appState.fileTags || {}) as Record<string, { color?: string; label?: string } | string>;
  const raw = fileTags[path];
  if (!raw) return { tags: [], colorLabel: '' };
  if (typeof raw === 'string') return { tags: [raw], colorLabel: raw };
  const label = raw.label || raw.color || '';
  return { tags: label ? [label] : [], colorLabel: label };
}

export async function loadFileContexts(
  targets: CollectedRenameTarget[],
  settings: AdvancedRenameSettings,
): Promise<CollectedRenameTarget[]> {
  const needImages = settingsNeedImageContext(settings);
  const imageTargets = needImages
    ? targets.filter((target) => isImageEntry(target.entry))
    : [];

  const contexts = new Map<string, AdvancedRenameFileContext>();
  const concurrency = 4;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < imageTargets.length) {
      const index = cursor;
      cursor += 1;
      const target = imageTargets[index];
      try {
        const metadata = await getImageMetadata(target.entry.path);
        const exif: Record<string, string> = {};
        for (const pair of metadata.exif || []) {
          if (pair && pair.length >= 2) exif[pair[0]] = pair[1];
        }
        contexts.set(target.entry.path, {
          width: metadata.width,
          height: metadata.height,
          exif,
          camera: cameraFromExif(exif),
          dateTaken: dateTakenFromExif(exif),
        });
      } catch {
        contexts.set(target.entry.path, {});
      }
    }
  }

  if (imageTargets.length > 0) {
    await Promise.all(Array.from({ length: Math.min(concurrency, imageTargets.length) }, () => worker()));
  }

  return targets.map((target) => {
    const tags = tagsForPath(target.entry.path);
    return {
      ...target,
      context: {
        ...(contexts.get(target.entry.path) || {}),
        tags: tags.tags,
        colorLabel: tags.colorLabel,
      },
    };
  });
}

export function previewAdvancedRename(
  targets: CollectedRenameTarget[],
  settings: AdvancedRenameSettings,
): { plans: AdvancedRenamePlan[]; filterError: string | null } {
  return buildRenamePlans(targets, settings);
}

function toRequest(plan: AdvancedRenamePlan): RenameRequest {
  return { path: plan.path, new_name: plan.newName };
}

function undoRequest(plan: AdvancedRenamePlan): RenameRequest {
  return {
    path: joinPath(plan.parentPath, plan.newName),
    new_name: plan.oldName,
  };
}

export async function applyAdvancedRenamePlans(plans: AdvancedRenamePlan[]): Promise<number> {
  const invalid = plans.find((plan) => plan.error);
  if (invalid) {
    throw new Error(invalid.error || 'Resolve invalid rename targets before applying.');
  }

  const changed = plans.filter((plan) => plan.changed);
  if (changed.length === 0) {
    throw new Error('No names would change.');
  }

  const files = changed.filter((plan) => !plan.isDir);
  const folders = changed
    .filter((plan) => plan.isDir)
    .sort((left, right) => right.path.length - left.path.length);

  await runWithProgress('Renaming Items', `${changed.length} item${changed.length === 1 ? '' : 's'}`, async () => {
    if (files.length > 0) {
      await batchRename(files.map(toRequest));
    }
    for (const folder of folders) {
      await batchRename([toRequest(folder)]);
    }
  });

  pushUndoEntry({
    description: `Rename ${changed.length} item${changed.length === 1 ? '' : 's'}`,
    undo: async () => {
      for (const folder of [...folders].reverse()) {
        await batchRename([undoRequest(folder)]);
      }
      if (files.length > 0) {
        await batchRename(files.map(undoRequest));
      }
    },
    redo: async () => {
      if (files.length > 0) {
        await batchRename(files.map(toRequest));
      }
      for (const folder of folders) {
        await batchRename([toRequest(folder)]);
      }
    },
  });

  showUndoableSuccess(
    `Renamed ${changed.length} item${changed.length === 1 ? '' : 's'}`,
    () => {
      void undoLastFlow();
    },
  );

  await refreshPane(activePaneId());

  return changed.length;
}


