<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import AdvancedRenamePreview from '../advanced-rename-preview/AdvancedRenamePreview.svelte';
  import {
    cloneAdvancedRenameSettings,
    defaultAdvancedRenameSettings,
    type AdvancedRenamePlan,
    type AdvancedRenameSettings,
  } from '../../advancedRenameEngine';
  import { loadAdvancedRenameSettings, saveAdvancedRenameSettings } from '../../advancedRenameStorage';
  import {
    applyAdvancedRenamePlans,
    collectAdvancedRenameTargets,
    loadFileContexts,
    previewAdvancedRename,
    selectedRenameEntries,
    selectionAnalysis,
    type CollectedRenameTarget,
  } from '../../app/advanced_rename';
  import { showError } from '../toasts';

  const PREVIEW_LIMIT = 500;

  let open = $state(false);
  let settings = $state<AdvancedRenameSettings>(defaultAdvancedRenameSettings());
  let selectedHint = $state('');
  let summary = $state('');
  let filterError = $state<string | null>(null);
  let loading = $state(false);
  let applying = $state(false);
  let plans = $state<AdvancedRenamePlan[]>([]);
  let cachedTargets = $state<CollectedRenameTarget[]>([]);
  let cacheKey = $state('');
  let analysis = $state(selectionAnalysis([]));
  let collectGeneration = 0;
  let closeButton = $state<HTMLButtonElement | undefined>(undefined);

  let previewMode = $derived<'loading' | 'error' | 'empty' | 'rows'>(
    loading ? 'loading' : filterError ? 'error' : plans.length === 0 ? 'empty' : 'rows',
  );
  let previewRows = $derived(plans.slice(0, PREVIEW_LIMIT).map((plan) => ({
    changed: plan.changed,
    detail: plan.error || plan.detail,
    error: plan.error,
    newName: plan.newName,
    oldName: plan.oldName,
  })));
  let extraCount = $derived(Math.max(0, plans.length - PREVIEW_LIMIT));
  let changedCount = $derived(plans.filter((plan) => plan.changed && !plan.error).length);
  let hasErrors = $derived(plans.some((plan) => Boolean(plan.error)));
  let canApply = $derived(!loading && !applying && changedCount > 0 && !hasErrors && !filterError);

  function scopeKey(value: AdvancedRenameSettings): string {
    return `${value.includeRecursive}|${value.includeHidden}|${value.renameFolders}`;
  }

  function describeSelection(): string {
    const selected = selectedRenameEntries();
    analysis = selectionAnalysis(selected);
    const parts = [];
    if (analysis.fileCount) parts.push(`${analysis.fileCount} file${analysis.fileCount === 1 ? '' : 's'}`);
    if (analysis.folderCount) parts.push(`${analysis.folderCount} folder${analysis.folderCount === 1 ? '' : 's'}`);
    if (analysis.imageCount) parts.push(`${analysis.imageCount} image${analysis.imageCount === 1 ? '' : 's'}`);
    return parts.length > 0 ? `Selected ${parts.join(' · ')}` : 'No items selected';
  }

  async function refreshPreview(): Promise<void> {
    if (!open) return;
    const generation = ++collectGeneration;
    const selected = selectedRenameEntries();
    selectedHint = describeSelection();
    if (selected.length === 0) {
      cachedTargets = [];
      plans = [];
      summary = 'Select one or more items to rename.';
      filterError = null;
      loading = false;
      return;
    }

    loading = true;
    try {
      const nextKey = scopeKey(settings);
      if (nextKey !== cacheKey || cachedTargets.length === 0) {
        cachedTargets = await collectAdvancedRenameTargets(settings);
        cacheKey = nextKey;
      }
      if (generation !== collectGeneration) return;

      const withContext = await loadFileContexts(cachedTargets, settings);
      if (generation !== collectGeneration) return;

      const preview = previewAdvancedRename(withContext, settings);
      plans = preview.plans;
      filterError = preview.filterError;
      if (preview.filterError) {
        summary = `Filter error: ${preview.filterError}`;
      } else if (plans.length === 0) {
        summary = analysis.hasFolders && !settings.includeRecursive && !settings.renameFolders
          ? 'No matching files. Include folder contents or enable Rename folders.'
          : 'No matching files.';
      } else {
        const label = plans.length === 1 ? 'target' : 'targets';
        const changeLabel = changedCount === 1 ? 'change' : 'changes';
        summary = `${plans.length} ${label} ready · ${changedCount} ${changeLabel}.`;
      }
    } catch (error) {
      filterError = error instanceof Error ? error.message : String(error);
      plans = [];
      summary = filterError;
    } finally {
      if (generation === collectGeneration) loading = false;
    }
  }

  function persistSettings(): void {
    saveAdvancedRenameSettings(settings);
  }

  function handleSettingChange(): void {
    persistSettings();
    void refreshPreview();
  }

  function openOverlay(): void {
    const selected = selectedRenameEntries();
    if (selected.length === 0) {
      showError('Select one or more items to rename.');
      return;
    }

    settings = cloneAdvancedRenameSettings(loadAdvancedRenameSettings());
    cacheKey = '';
    cachedTargets = [];
    plans = [];
    filterError = null;
    open = true;
    selectedHint = describeSelection();
    void tick().then(() => closeButton?.focus());
    void refreshPreview();
  }

  function closeOverlay(): void {
    collectGeneration += 1;
    open = false;
    applying = false;
    loading = false;
  }

  async function applyRename(): Promise<void> {
    if (!canApply) return;
    applying = true;
    try {
      await refreshPreview();
      await applyAdvancedRenamePlans(plans);
      persistSettings();
      closeOverlay();
    } catch (error) {
      showError(error);
    } finally {
      applying = false;
    }
  }

  function handleOpenEvent(): void {
    openOverlay();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeOverlay();
    }
  }

  onMount(() => {
    document.addEventListener('simplefile:advanced-rename', handleOpenEvent);
    document.addEventListener('keydown', handleKeydown, true);
  });

  onDestroy(() => {
    document.removeEventListener('simplefile:advanced-rename', handleOpenEvent);
    document.removeEventListener('keydown', handleKeydown, true);
  });
</script>

{#if open}
  <div
    class="advanced-rename-overlay"
    id="advanced-rename-overlay"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="advanced-rename-title"
    onclick={(event) => {
      if (event.target === event.currentTarget) closeOverlay();
    }}
    onkeydown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeOverlay();
      }
    }}
  >
    <div class="modal advanced-rename-modal">
      <div class="modal-header">
        <h3 id="advanced-rename-title">Advanced Rename</h3>
        <button bind:this={closeButton} class="modal-close" id="adv-rename-close" type="button" aria-label="Close" onclick={closeOverlay}>&times;</button>
      </div>
      <div class="modal-body adv-rename-body">
        <div class="adv-rename-options-column">
          <p class="adv-rename-summary" id="adv-rename-summary">{summary}</p>
          <p class="adv-rename-context">{selectedHint}</p>
          <div class="adv-rename-scope">
            <label class="adv-inline-check">
              <input type="checkbox" bind:checked={settings.includeRecursive} onchange={handleSettingChange}>
              Include files inside selected folders
            </label>
            <label class="adv-inline-check">
              <input type="checkbox" bind:checked={settings.includeHidden} onchange={handleSettingChange}>
              Include dotfiles
            </label>
            {#if analysis.hasFolders}
              <label class="adv-inline-check">
                <input type="checkbox" bind:checked={settings.renameFolders} onchange={handleSettingChange}>
                Rename folders
              </label>
            {/if}
            <label for="adv-apply-part">Apply text ops to:</label>
            <select class="form-input" id="adv-apply-part" bind:value={settings.applyPart} onchange={handleSettingChange}>
              <option value="full">Full name</option>
              <option value="base">Name without extension</option>
              <option value="extension">Extension only</option>
            </select>
          </div>

          <div class="adv-rename-ops">
            <div class="adv-rename-op" class:op-enabled={settings.filter.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.filter.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Filter Targets</span>
              </label>
              {#if settings.filter.enabled}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-filter-kind">Kind:</label>
                    <select class="form-input" id="adv-filter-kind" bind:value={settings.filter.kind} onchange={handleSettingChange}>
                      <option value="all">Files and folders</option>
                      <option value="files">Files only</option>
                      <option value="folders">Folders only</option>
                    </select>
                  </div>
                  <div class="adv-field-row">
                    <label for="adv-filter-text">Name:</label>
                    <input type="text" class="form-input" id="adv-filter-text" placeholder="Only names matching" bind:value={settings.filter.text} oninput={handleSettingChange}>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.filter.regex} onchange={handleSettingChange}> Regex
                    </label>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.filter.caseSensitive} onchange={handleSettingChange}> Case sensitive
                    </label>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.filter.invert} onchange={handleSettingChange}> Invert
                    </label>
                  </div>
                  <div class="adv-field-row">
                    <label for="adv-filter-extensions">Extensions:</label>
                    <input type="text" class="form-input" id="adv-filter-extensions" placeholder="jpg, png, md" bind:value={settings.filter.extensions} oninput={handleSettingChange}>
                  </div>
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.template.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.template.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Template</span>
              </label>
              {#if settings.template.enabled}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-template-pattern">Pattern:</label>
                    <input type="text" class="form-input" id="adv-template-pattern" placeholder="{'{base}_{n}'}" bind:value={settings.template.pattern} oninput={handleSettingChange}>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.template.keepExtension} onchange={handleSettingChange}> Keep extension
                    </label>
                  </div>
                  <div class="adv-template-help">
                    <p><strong>Available variables</strong></p>
                    <ul class="adv-template-vars">
                      <li><code>{'{base}'}</code>: name without extension</li>
                      <li><code>{'{ext}'}</code>: extension</li>
                      <li><code>{'{name}'}</code>: full original name</li>
                      <li><code>{'{parent}'}</code>: parent folder name</li>
                      <li><code>{'{n}'}</code>: sequence number</li>
                      <li><code>{'{yyyy}'}</code> <code>{'{mm}'}</code> <code>{'{dd}'}</code>: file modified date</li>
                      <li><code>{'{hh}'}</code> <code>{'{min}'}</code> <code>{'{ss}'}</code>: file modified time</li>
                      <li><code>{'{date}'}</code> <code>{'{time}'}</code>: file modified date/time</li>
                      <li><code>{'{now}'}</code> <code>{'{now_date}'}</code>: current date</li>
                      <li><code>{'{size}'}</code> <code>{'{type}'}</code> <code>{'{kind}'}</code></li>
                      <li><code>{'{tag}'}</code> <code>{'{git}'}</code></li>
                      {#if analysis.hasImages}
                        <li><code>{'{width}'}</code> <code>{'{height}'}</code> <code>{'{camera}'}</code> <code>{'{date_taken}'}</code></li>
                        <li><code>{'{exif:Tag}'}</code>: any EXIF field</li>
                      {/if}
                    </ul>
                  </div>
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.remove.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.remove.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Remove String</span>
              </label>
              {#if settings.remove.enabled}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-remove-string">Remove:</label>
                    <input type="text" class="form-input" id="adv-remove-string" placeholder="Text to remove" bind:value={settings.remove.text} oninput={handleSettingChange}>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.remove.regex} onchange={handleSettingChange}> Regex
                    </label>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.remove.caseSensitive} onchange={handleSettingChange}> Case sensitive
                    </label>
                  </div>
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.replace.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.replace.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Replace String</span>
              </label>
              {#if settings.replace.enabled}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-replace-find">Find:</label>
                    <input type="text" class="form-input" id="adv-replace-find" placeholder="Find text" bind:value={settings.replace.find} oninput={handleSettingChange}>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.replace.regex} onchange={handleSettingChange}> Regex
                    </label>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.replace.caseSensitive} onchange={handleSettingChange}> Case sensitive
                    </label>
                  </div>
                  <div class="adv-field-row">
                    <label for="adv-replace-with">Replace:</label>
                    <input type="text" class="form-input" id="adv-replace-with" placeholder="Replace with (empty = delete)" bind:value={settings.replace.replaceWith} oninput={handleSettingChange}>
                  </div>
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.trim.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.trim.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Trim Whitespace</span>
              </label>
              {#if settings.trim.enabled}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-trim-mode">Mode:</label>
                    <select class="form-input" id="adv-trim-mode" bind:value={settings.trim.mode} onchange={handleSettingChange}>
                      <option value="both">Start and end</option>
                      <option value="start">Start only</option>
                      <option value="end">End only</option>
                    </select>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.trim.collapse} onchange={handleSettingChange}> Collapse spaces
                    </label>
                  </div>
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.add.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.add.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Add String</span>
              </label>
              {#if settings.add.enabled}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-add-string">Insert:</label>
                    <input type="text" class="form-input" id="adv-add-string" placeholder="Text to add" bind:value={settings.add.text} oninput={handleSettingChange}>
                    <label for="adv-add-position">Position:</label>
                    <select class="form-input" id="adv-add-position" bind:value={settings.add.position} onchange={handleSettingChange}>
                      <option value="prefix">Before name</option>
                      <option value="suffix">After name</option>
                      <option value="before-ext">Before extension</option>
                      <option value="index">At character</option>
                    </select>
                    {#if settings.add.position === 'index'}
                      <label for="adv-add-index">Index:</label>
                      <input type="number" class="form-input adv-number-input" id="adv-add-index" min="0" step="1" bind:value={settings.add.index} oninput={handleSettingChange}>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.capitalize.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.capitalize.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Capitalize</span>
              </label>
              {#if settings.capitalize.enabled}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-capitalize-mode">Mode:</label>
                    <select class="form-input" id="adv-capitalize-mode" bind:value={settings.capitalize.mode} onchange={handleSettingChange}>
                      <option value="first">Capitalize first letter</option>
                      <option value="words">Capitalize each word</option>
                      <option value="title">Title Case</option>
                      <option value="sentence">Sentence case</option>
                      <option value="upper">UPPERCASE</option>
                      <option value="lower">lowercase</option>
                    </select>
                  </div>
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.separator.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.separator.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Separators</span>
              </label>
              {#if settings.separator.enabled}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-separator-mode">Convert:</label>
                    <select class="form-input" id="adv-separator-mode" bind:value={settings.separator.mode} onchange={handleSettingChange}>
                      <option value="spaces-to-dashes">Spaces to dashes</option>
                      <option value="spaces-to-underscores">Spaces to underscores</option>
                      <option value="underscores-to-spaces">Underscores to spaces</option>
                      <option value="dashes-to-spaces">Dashes to spaces</option>
                      <option value="dots-to-spaces">Dots to spaces</option>
                    </select>
                    <label class="adv-inline-check">
                      <input type="checkbox" bind:checked={settings.separator.collapse} onchange={handleSettingChange}> Collapse repeats
                    </label>
                  </div>
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.number.enabled} class:op-expanded={settings.number.enabled || settings.template.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.number.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Sequential Numbering</span>
              </label>
              {#if settings.number.enabled || settings.template.enabled}
                <div class="adv-op-body">
                  {#if !settings.number.enabled && settings.template.enabled}
                    <p class="adv-inline-note">Template <code>{'{n}'}</code> uses these numbering values even when this operation is off.</p>
                  {/if}
                  <div class="adv-field-row">
                    <label for="adv-number-start">Start:</label>
                    <input type="number" class="form-input adv-number-input" id="adv-number-start" min="0" step="1" bind:value={settings.number.start} oninput={handleSettingChange}>
                    <label for="adv-number-step">Step:</label>
                    <input type="number" class="form-input adv-number-input" id="adv-number-step" step="1" bind:value={settings.number.step} oninput={handleSettingChange}>
                    <label for="adv-number-pad">Digits:</label>
                    <input type="number" class="form-input adv-number-input" id="adv-number-pad" min="1" max="10" step="1" bind:value={settings.number.pad} oninput={handleSettingChange}>
                  </div>
                  {#if settings.number.enabled}
                    <div class="adv-field-row">
                      <label for="adv-number-position">Position:</label>
                      <select class="form-input" id="adv-number-position" bind:value={settings.number.position} onchange={handleSettingChange}>
                        <option value="prefix">Before name</option>
                        <option value="suffix">After name</option>
                        <option value="before-ext">Before extension</option>
                        <option value="replace">Replace name</option>
                      </select>
                      <label for="adv-number-separator">Separator:</label>
                      <input type="text" class="form-input adv-number-input" id="adv-number-separator" maxlength="8" placeholder="_" bind:value={settings.number.separator} oninput={handleSettingChange}>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.extension.enabled} class:op-disabled={analysis.allFolders}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.extension.enabled} disabled={analysis.allFolders} onchange={handleSettingChange}>
                <span class="adv-op-label">Extension</span>
              </label>
              {#if settings.extension.enabled && !analysis.allFolders}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-extension-mode">Mode:</label>
                    <select class="form-input" id="adv-extension-mode" bind:value={settings.extension.mode} onchange={handleSettingChange}>
                      <option value="lower">lowercase</option>
                      <option value="upper">UPPERCASE</option>
                      <option value="set">Set to</option>
                      <option value="remove">Remove</option>
                    </select>
                    {#if settings.extension.mode === 'set'}
                      <label for="adv-extension-custom">Value:</label>
                      <input type="text" class="form-input adv-extension-input" id="adv-extension-custom" placeholder="txt" bind:value={settings.extension.custom} oninput={handleSettingChange}>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>

            <div class="adv-rename-op" class:op-enabled={settings.sanitize.enabled}>
              <label class="adv-op-toggle">
                <input type="checkbox" bind:checked={settings.sanitize.enabled} onchange={handleSettingChange}>
                <span class="adv-op-label">Sanitize Invalid Characters</span>
              </label>
              {#if settings.sanitize.enabled}
                <div class="adv-op-body">
                  <div class="adv-field-row">
                    <label for="adv-sanitize-replacement">Replace with:</label>
                    <input type="text" class="form-input adv-number-input" id="adv-sanitize-replacement" maxlength="8" bind:value={settings.sanitize.replacement} oninput={handleSettingChange}>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <div class="adv-rename-preview-column">
          <div class="adv-rename-preview-section">
            <h4 class="adv-rename-preview-title">Preview</h4>
            <div class="adv-rename-preview" id="adv-rename-preview">
              <AdvancedRenamePreview
                extraCount={extraCount}
                limit={PREVIEW_LIMIT}
                message={loading ? 'Building preview...' : filterError || (plans.length === 0 ? summary : '')}
                mode={previewMode}
                rows={previewRows}
                totalRows={plans.length}
              />
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="adv-rename-cancel" type="button" onclick={closeOverlay}>Cancel</button>
        <button class="btn btn-primary" id="adv-rename-confirm" type="button" disabled={!canApply} onclick={() => void applyRename()}>
          {applying ? 'Renaming…' : 'Rename'}
        </button>
      </div>
    </div>
  </div>
{/if}
