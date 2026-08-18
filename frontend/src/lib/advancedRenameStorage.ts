import {
  defaultAdvancedRenameSettings,
  parseAdvancedRenameSettings,
  type AdvancedRenameSettings,
} from './advancedRenameEngine';

export const ADVANCED_RENAME_SETTINGS_KEY = 'simplefile-advanced-rename-settings';

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadAdvancedRenameSettings(
  storage: Storage | null = getStorage(),
): AdvancedRenameSettings {
  if (!storage) return defaultAdvancedRenameSettings();

  try {
    const raw = storage.getItem(ADVANCED_RENAME_SETTINGS_KEY);
    return parseAdvancedRenameSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultAdvancedRenameSettings();
  }
}

export function saveAdvancedRenameSettings(
  settings: AdvancedRenameSettings,
  storage: Storage | null = getStorage(),
): AdvancedRenameSettings {
  const parsed = parseAdvancedRenameSettings(settings);
  if (!storage) return parsed;

  try {
    storage.setItem(ADVANCED_RENAME_SETTINGS_KEY, JSON.stringify(parsed));
  } catch {
    // Private mode or quota: keep using the in-memory settings.
  }

  return parsed;
}
