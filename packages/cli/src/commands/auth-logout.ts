/**
 * moment auth logout — ADR-026
 */

import { removeToken } from '../auth/token-storage.js';

export interface AuthLogoutResult {
  readonly success: boolean;
  readonly message: string;
}

export async function runAuthLogout(): Promise<AuthLogoutResult> {
  const removed = await removeToken();

  if (removed) {
    return {
      success: true,
      message: 'Token removed.',
    };
  }

  return {
    success: true,
    message: 'No credentials found. Already logged out.',
  };
}
