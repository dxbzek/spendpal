import { useSyncExternalStore } from 'react';
import { userSettings, type KnownSettings, type SettingKey, type SettingsSnapshot } from '@/lib/userSettings';

/** Every mounted reader re-renders when a setting changes, on any page. */
export function useUserSettings(): SettingsSnapshot {
  return useSyncExternalStore(userSettings.subscribe, userSettings.getSnapshot);
}

export function useUserSetting<K extends SettingKey>(key: K): KnownSettings[K] {
  return useUserSettings().data[key] as KnownSettings[K];
}

const userIdOf = () => userSettings.getSnapshot().userId;
/** The signed-in user the settings belong to. Re-renders only when that user changes. */
export function useSettingsUserId(): string | null {
  return useSyncExternalStore(userSettings.subscribe, userIdOf);
}
