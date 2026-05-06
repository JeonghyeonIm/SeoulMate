// src/repositories/preference.repository.ts
import { type CreatePreferenceParams, type PreferenceRecord } from "../types/auth.types";

import { getPreferences, insertPreference } from "./inMemoryDatabase";

export async function findByUserId(userId: string): Promise<PreferenceRecord | null> {
  const preferences: PreferenceRecord[] = getPreferences();
  const preference: PreferenceRecord | undefined = preferences.find(
    (storedPreference: PreferenceRecord): boolean => {
      return storedPreference.userId === userId;
    }
  );

  return preference ?? null;
}

export async function save(preferenceData: CreatePreferenceParams): Promise<PreferenceRecord> {
  return insertPreference(preferenceData);
}
