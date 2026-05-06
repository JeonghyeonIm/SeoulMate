// src/repositories/inMemoryDatabase.ts
import { type PreferenceRecord, type UserRecord } from "../types/auth.types";

const users: UserRecord[] = [];
const preferences: PreferenceRecord[] = [];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getUsers(): UserRecord[] {
  return clone(users);
}

export function getPreferences(): PreferenceRecord[] {
  return clone(preferences);
}

export function insertUser(user: UserRecord): UserRecord {
  const userToInsert: UserRecord = clone(user);
  users.push(userToInsert);

  return clone(userToInsert);
}

export function insertPreference(preference: PreferenceRecord): PreferenceRecord {
  const preferenceToInsert: PreferenceRecord = clone(preference);
  preferences.push(preferenceToInsert);

  return clone(preferenceToInsert);
}

export function resetInMemoryDatabase(): void {
  users.length = 0;
  preferences.length = 0;
}
