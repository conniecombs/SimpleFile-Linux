const fs = require('fs');
const file = 'frontend/src/legacy/settings-body/SettingsBody.svelte';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `import ActivationSettings from './ActivationSettings.svelte';`,
  `import ActivationSettings from './ActivationSettings.svelte';\n  import { invoke } from '@tauri-apps/api/core';\n  import { onMount } from 'svelte';`
);

content = content.replace(
  `type SettingsTab = 'general' | 'places' | 'tools' | 'updates';`,
  `type SettingsTab = 'general' | 'places' | 'tools' | 'cloud' | 'updates';`
);

content = content.replace(
  `{ id: 'tools', label: 'Tools' },`,
  `{ id: 'tools', label: 'Tools' },\n    { id: 'cloud', label: 'Cloud APIs' },`
);

const stateBlock = `
  let googleClientId = $state('');
  let googleClientSecret = $state('');
  let githubToken = $state('');
  let githubClientId = $state('');

  let githubAuthPending = $state(false);
  let githubUserCode = $state('');
  let githubVerificationUri = $state('');

  onMount(async () => {
    try {
      googleClientId = await invoke('get_db_setting', { key: 'google_client_id' }) || '';
      googleClientSecret = await invoke('get_db_setting', { key: 'google_client_secret' }) || '';
      githubToken = await invoke('get_db_setting', { key: 'github_token' }) || '';
      githubClientId = await invoke('get_db_setting', { key: 'github_client_id' }) || '';
    } catch (e) {
      console.error('Failed to load cloud keys:', e);
    }
  });

  async function startGithubAuth() {
    try {
      if (!githubClientId.trim()) {
        alert("Please enter a GitHub OAuth App Client ID first.");
        return;
      }
      const clientId = githubClientId.trim();
      const res = await invoke('github_request_device_code', { clientId });
      githubUserCode = res.user_code;
      githubVerificationUri = res.verification_uri;
      githubAuthPending = true;

      pollGithubToken(clientId, res.device_code, res.interval);
    } catch(e) {
      console.error(e);
      alert("Failed to start GitHub auth: " + e);
    }
  }

  async function pollGithubToken(clientId, deviceCode, interval) {
    while (githubAuthPending) {
      await new Promise(r => setTimeout(r, interval * 1000));
      if (!githubAuthPending) break;
      try {
        const token = await invoke('github_poll_token', { clientId, deviceCode });
        githubToken = token;
        githubAuthPending = false;
        await saveCloudKeys();
        alert("Successfully logged into GitHub!");
      } catch(e) {
        if (e !== "authorization_pending") {
          console.error(e);
          githubAuthPending = false;
          alert("GitHub auth failed: " + e);
        }
      }
    }
  }

  async function saveCloudKeys() {
    try {
      await invoke('set_db_setting', { key: 'google_client_id', value: googleClientId });
      await invoke('set_db_setting', { key: 'google_client_secret', value: googleClientSecret });
      await invoke('set_db_setting', { key: 'github_token', value: githubToken });
      await invoke('set_db_setting', { key: 'github_client_id', value: githubClientId });
      const toastEvent = new CustomEvent('simplefile:toast', {
        detail: { message: 'Cloud keys saved successfully', type: 'success' }
      });
      document.dispatchEvent(toastEvent);
    } catch (e) {
      console.error('Failed to save cloud keys:', e);
      const toastEvent = new CustomEvent('simplefile:toast', {
        detail: { message: 'Failed to save cloud keys', type: 'error' }
      });
      document.dispatchEvent(toastEvent);
    }
  }
`;

content = content.replace(`let activeSettingsTab: SettingsTab = $state('general');`, `let activeSettingsTab: SettingsTab = $state('general');\n${stateBlock}`);

const uiBlock = `
  <div
    class="settings-tab-panel"
    id="settings-panel-cloud"
    data-settings-panel="cloud"
    role="tabpanel"
    aria-labelledby="settings-tab-cloud"
    hidden={activeSettingsTab !== 'cloud'}
  >
    <div class="settings-section">
      <h4>Google Drive (Rclone)</h4>
      <p style="font-size: 12px; color: var(--text-secondary, #999); margin-bottom: 12px;">Provide your own Google Cloud API credentials to bypass the default rate limits.</p>
      <div class="settings-row" style="flex-direction: column; align-items: stretch; gap: 4px;">
        <label for="settings-gdrive-client-id">Client ID</label>
        <input type="text" id="settings-gdrive-client-id" bind:value={googleClientId} placeholder="Leave blank to use default" />
      </div>
      <div class="settings-row" style="flex-direction: column; align-items: stretch; gap: 4px; margin-top: 12px;">
        <label for="settings-gdrive-client-secret">Client Secret</label>
        <input type="password" id="settings-gdrive-client-secret" bind:value={googleClientSecret} placeholder="Leave blank to use default" />
      </div>

      <h4 style="margin-top: 24px;">GitHub Integration</h4>
      <p style="font-size: 12px; color: var(--text-secondary, #999); margin-bottom: 12px;">Log in via GitHub Device Flow or provide a Personal Access Token (classic or fine-grained) to enable Git push and pull.</p>
      
      <div class="settings-row" style="flex-direction: column; align-items: stretch; gap: 4px;">
        <label for="settings-github-client-id">OAuth App Client ID (For Device Flow Login)</label>
        <input type="text" id="settings-github-client-id" bind:value={githubClientId} placeholder="Client ID from GitHub Developer Settings" />
      </div>

      <div class="settings-row" style="flex-direction: column; align-items: stretch; gap: 4px; margin-top: 12px;">
        <label for="settings-github-token">Personal Access Token (PAT) / OAuth Token</label>
        <input type="password" id="settings-github-token" bind:value={githubToken} placeholder="ghp_..." />
      </div>

      {#if githubAuthPending}
        <div style="margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 6px; border: 1px solid var(--border-color);">
          <p style="margin-bottom: 8px;">Please go to <a href={githubVerificationUri} target="_blank">{githubVerificationUri}</a> and enter the code below:</p>
          <h2 style="margin: 0; text-align: center; letter-spacing: 2px;">{githubUserCode}</h2>
          <p style="margin-top: 8px; font-size: 12px; color: var(--text-secondary); text-align: center;">Waiting for authorization...</p>
        </div>
      {:else}
        <div class="settings-row" style="margin-top: 12px;">
          <button class="btn btn-secondary" onclick={startGithubAuth}>Log in to GitHub (Device Flow)</button>
        </div>
      {/if}

      <div class="settings-row" style="margin-top: 16px;">
        <button class="btn btn-primary" onclick={saveCloudKeys}>Save Keys</button>
      </div>
    </div>
  </div>
`;

content = content.replace(
  `<div\n    class="settings-tab-panel"\n    id="settings-panel-updates"`,
  `${uiBlock}\n  <div\n    class="settings-tab-panel"\n    id="settings-panel-updates"`
);

fs.writeFileSync(file, content);
console.log('Successfully patched SettingsBody.svelte');
