import { PluginSettings } from '../shared/types';

const SETTINGS_KEY = 'plugin-settings';

export async function loadSettings(): Promise<PluginSettings> {
  try {
    const settings = await figma.clientStorage.getAsync(SETTINGS_KEY);
    return settings || {};
  } catch (error) {
    console.error('Failed to load settings:', error);
    return {};
  }
}

export async function saveSettings(settings: PluginSettings): Promise<boolean> {
  try {
    await figma.clientStorage.setAsync(SETTINGS_KEY, settings);
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
}
