// src/repositories/user.repository.ts
import { type CreateUserParams, type UserRecord } from "../types/auth.types";

import { getUsers, insertUser } from "./inMemoryDatabase";

export async function findByEmail(email: string): Promise<UserRecord | null> {
  const users: UserRecord[] = getUsers();
  const user: UserRecord | undefined = users.find((storedUser: UserRecord): boolean => {
    return storedUser.email === email;
  });

  return user ?? null;
}

export async function findByNickname(nickname: string): Promise<UserRecord | null> {
  const users: UserRecord[] = getUsers();
  const user: UserRecord | undefined = users.find((storedUser: UserRecord): boolean => {
    return storedUser.nickname === nickname;
  });

  return user ?? null;
}

export async function save(userData: CreateUserParams): Promise<UserRecord> {
  return insertUser(userData);
}
