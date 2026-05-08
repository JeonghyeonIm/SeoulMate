import type { UserProfile } from "../models/user.model";
import { recommendationRepository } from "../repositories/recommendation.repository";
import { userRepository } from "../repositories/user.repository";
import { ApiError } from "../utils/ApiError";

interface ListUsersInput {
  page?: number;
  pageSize?: number;
}

interface UpdatePreferencesInput {
  preferredRegion?: string | null;
  vibes?: string[];
  budget?: number;
}

export const userService = {
  async getUser(id: number): Promise<UserProfile> {
    const user = await userRepository.getById(id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return user;
  },

  async listUsers(input: ListUsersInput): Promise<UserProfile[]> {
    return userRepository.listUsers(input);
  },

  async countUsers(): Promise<number> {
    return userRepository.countUsers();
  },

  async countSavedCourses(id: number): Promise<number> {
    return recommendationRepository.countSavedCourses(id);
  },

  async updatePreferences(id: number, input: UpdatePreferencesInput): Promise<UserProfile> {
    const user = await userRepository.updatePreferences(id, input);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return user;
  }
};
