<script lang="ts">
  type SettingsSection = 'appearance' | 'browser' | 'startup' | 'files' | 'integration' | 'about';
  type LegacySettingsTab = 'general' | 'tools' | 'updates';

  let { activeTab: initialActiveTab = 'appearance' }: { activeTab?: SettingsSection | LegacySettingsTab } = $props();
  let activeSettingsTab: SettingsSection = $state('appearance');

  const sections: { hint: string; id: SettingsSection; label: string }[] = [
    { id: 'appearance', label: 'Appearance', hint: 'Theme and starting view' },
    { id: 'browser', label: 'Browser', hint: 'Folders, columns, and the sidebar' },
    { id: 'startup', label: 'Startup', hint: 'Where a new window opens' },
    { id: 'files', label: 'Files', hint: 'Delete confirmation' },
    { id: 'integration', label: 'Integration', hint: 'Git, RAR, and the system' },
    { id: 'about', label: 'About', hint: 'Version and updates' },
  ];

  $effect(() => {
    const mapped = initialActiveTab === 'general'
      ? 'appearance'
      : initialActiveTab === 'tools'
        ? 'integration'
        : initialActiveTab === 'updates'
          ? 'about'
          : initialActiveTab;
    activeSettingsTab = mapped;
  });

  function activateTab(tabId: SettingsSection, { focus = false } = {}) {
    activeSettingsTab = tabId;

    if (focus) {
      requestAnimationFrame(() => {
        document.getElementById(`settings-tab-${tabId}`)?.focus();
      });
    }
  }

  function handleTabKeydown(event: KeyboardEvent, tabId: SettingsSection) {
    const currentIndex = sections.findIndex((tab) => tab.id === tabId);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % sections.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + sections.length) % sections.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = sections.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    activateTab(sections[nextIndex].id, { focus: true });
  }
</script>

<div class="settings-layout">
  <nav class="settings-nav" aria-label="Settings sections">
    <div class="settings-tabs" role="tablist" aria-orientation="vertical" aria-label="Settings sections">
      {#each sections as tab}
        <button
          type="button"
          class:active={activeSettingsTab === tab.id}
          class="settings-tab"
          id={`settings-tab-${tab.id}`}
          data-settings-tab={tab.id}
          role="tab"
          aria-selected={activeSettingsTab === tab.id}
          aria-controls={`settings-panel-${tab.id}`}
          tabindex={activeSettingsTab === tab.id ? 0 : -1}
          onclick={() => activateTab(tab.id)}
          onkeydown={(event) => handleTabKeydown(event, tab.id)}
        >
          <span class="settings-tab-label">{tab.label}</span>
          <span class="settings-tab-hint">{tab.hint}</span>
        </button>
      {/each}
    </div>
  </nav>

  <div class="settings-tab-content">
    <div
      class="settings-tab-panel"
      id="settings-panel-appearance"
      data-settings-panel="appearance"
      role="tabpanel"
      aria-labelledby="settings-tab-appearance"
      hidden={activeSettingsTab !== 'appearance'}
    >
      <div class="settings-section">
        <h4>Appearance</h4>
        <p class="settings-section-hint">These are the defaults for new windows and panes. The toolbar still changes the current view.</p>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-theme">Theme</label>
            <p class="settings-row-hint">Also available from View and tools in the toolbar.</p>
          </div>
          <select id="settings-theme">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-default-view">Default View</label>
            <p class="settings-row-hint">List or grid for new panes. The toolbar toggles the current pane.</p>
          </div>
          <select id="settings-default-view">
            <option value="list">List</option>
            <option value="grid">Grid</option>
          </select>
        </div>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-icon-size">Default Icon Size</label>
            <p class="settings-row-hint">Used in grid view. Adjust live from the toolbar when grid is on.</p>
          </div>
          <div class="settings-inline-control">
            <input type="range" id="settings-icon-size" min="48" max="128" value="64" />
            <span id="settings-icon-size-value">64px</span>
          </div>
        </div>
      </div>
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-browser"
      data-settings-panel="browser"
      role="tabpanel"
      aria-labelledby="settings-tab-browser"
      hidden={activeSettingsTab !== 'browser'}
    >
      <div class="settings-section">
        <h4>Folders and lists</h4>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-show-hidden">Show hidden files by default</label>
            <p class="settings-row-hint">New panes start with this. Ctrl+H toggles only the current pane.</p>
          </div>
          <input type="checkbox" id="settings-show-hidden" />
        </div>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-new-tab">Open folders in a new tab</label>
            <p class="settings-row-hint">When enabled, opening a folder can create a tab instead of replacing the current one.</p>
          </div>
          <input type="checkbox" id="settings-new-tab" />
        </div>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-auto-collapse">Auto-collapse the folder tree</label>
            <p class="settings-row-hint">Collapse sibling folders when expanding a node or moving to a new directory.</p>
          </div>
          <input type="checkbox" id="settings-auto-collapse" />
        </div>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-recent-locations">Show recent locations</label>
            <p class="settings-row-hint">Recently visited folders in the sidebar.</p>
          </div>
          <input type="checkbox" id="settings-recent-locations" />
        </div>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-folder-sizes">Calculate folder sizes</label>
            <p class="settings-row-hint">Show directory sizes in the Size column when possible.</p>
          </div>
          <input type="checkbox" id="settings-folder-sizes" />
        </div>
        <div class="settings-row">
          <span class="settings-row-label">Visible columns</span>
          <div class="settings-col-options">
            <label><input type="checkbox" id="settings-col-size" /> Size</label>
            <label><input type="checkbox" id="settings-col-items" /> Items</label>
            <label><input type="checkbox" id="settings-col-date" /> Modified</label>
            <label><input type="checkbox" id="settings-col-type" /> Type</label>
          </div>
        </div>
        <p class="settings-section-hint">You can also show or hide columns by right-clicking a list header.</p>
      </div>
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-startup"
      data-settings-panel="startup"
      role="tabpanel"
      aria-labelledby="settings-tab-startup"
      hidden={activeSettingsTab !== 'startup'}
    >
      <div class="settings-section">
        <h4>Startup</h4>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-start-location">Start location</label>
            <p class="settings-row-hint">Where SimpleFile opens when you launch it.</p>
          </div>
          <select id="settings-start-location">
            <option value="home">Home Directory</option>
            <option value="last">Last Used Location</option>
            <option value="custom">Custom Path</option>
          </select>
        </div>
        <div class="settings-row" id="settings-custom-path-row" style="display: none;">
          <label for="settings-custom-path">Custom path</label>
          <div class="settings-path-control">
            <input type="text" id="settings-custom-path" placeholder="Select a folder" />
            <button
              type="button"
              class="btn btn-secondary"
              id="settings-custom-path-browse"
              title="Select custom start folder"
            >
              Browse
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-files"
      data-settings-panel="files"
      role="tabpanel"
      aria-labelledby="settings-tab-files"
      hidden={activeSettingsTab !== 'files'}
    >
      <div class="settings-section">
        <h4>Files</h4>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-confirm-delete">Confirm before delete</label>
            <p class="settings-row-hint">Ask before moving items to trash or deleting them permanently.</p>
          </div>
          <input type="checkbox" id="settings-confirm-delete" checked />
        </div>
      </div>
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-integration"
      data-settings-panel="integration"
      role="tabpanel"
      aria-labelledby="settings-tab-integration"
      hidden={activeSettingsTab !== 'integration'}
    >
      <div class="settings-section" id="settings-git-section" style="display:none;">
        <h4>Git repository</h4>
        <div id="settings-git-status"></div>
      </div>

      <div class="settings-section">
        <h4>Git</h4>
        <div class="settings-row">
          <div class="settings-row-copy">
            <label for="settings-git-integration">Show Git status</label>
            <p class="settings-row-hint">Badge files when the current folder is inside a Git repository.</p>
          </div>
          <input type="checkbox" id="settings-git-integration" />
        </div>
      </div>

      <div class="settings-section">
        <h4>System</h4>
        <div class="settings-row">
          <div class="settings-row-copy">
            <span class="settings-row-label">Default file manager</span>
            <p class="settings-row-hint">Register SimpleFile as the handler for folders on this desktop.</p>
          </div>
          <button class="btn btn-secondary" id="set-default-fm-btn">Set as Default</button>
        </div>
        <p style="color: var(--text-secondary); font-size: 12px; margin-top: 4px; display: none;" id="set-default-fm-msg"></p>
      </div>

      <div class="settings-section">
        <h4>RAR tools</h4>
        <p class="settings-section-hint">
          SimpleFile extracts RAR archives on its own. Creating new RAR archives needs the WinRAR command-line tools.
        </p>
        <div class="settings-row">
          <span class="settings-row-label">RAR status</span>
          <span id="rar-status-text" class="rar-status-badge">Checking...</span>
        </div>
        <div class="settings-row" id="rar-install-row">
          <span class="settings-row-label" aria-hidden="true"></span>
          <div class="rar-install-controls">
            <button class="btn btn-secondary" id="rar-install-btn">Install RAR</button>
            <span id="rar-install-msg" class="rar-install-msg" style="display:none;"></span>
          </div>
        </div>
      </div>
    </div>

    <div
      class="settings-tab-panel"
      id="settings-panel-about"
      data-settings-panel="about"
      role="tabpanel"
      aria-labelledby="settings-tab-about"
      hidden={activeSettingsTab !== 'about'}
    >
      <div class="settings-section">
        <h4>Updates</h4>
        <div class="settings-row">
          <span class="settings-row-label">Current version</span>
          <span id="update-current-version" class="rar-status-badge">-</span>
        </div>
        <div class="settings-row" id="update-check-row">
          <span class="settings-row-label" aria-hidden="true"></span>
          <div class="rar-install-controls">
            <button class="btn btn-secondary" id="update-check-btn">Check for Updates</button>
            <span id="update-status-msg" class="rar-install-msg" style="display:none;"></span>
          </div>
        </div>
        <div class="settings-row" id="update-install-row" style="display:none;">
          <span class="settings-row-label" aria-hidden="true"></span>
          <div class="rar-install-controls">
            <button class="btn btn-primary" id="update-install-btn">Download &amp; Install</button>
            <span id="update-install-msg" class="rar-install-msg" style="display:none;"></span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h4>About</h4>
        <div class="settings-action-grid">
          <button
            type="button"
            class="settings-action-button"
            id="btn-about"
            title="About SimpleFile"
            aria-label="About SimpleFile"
            data-settings-dismiss=""
          >
            <span class="settings-action-icon" aria-hidden="true">i</span>
            <span>About SimpleFile</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
