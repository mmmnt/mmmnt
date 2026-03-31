/**
 * moment auth login — ADR-026 OAuth Device Flow
 */

import { requestDeviceCode, pollForToken } from '../auth/device-flow.js';
import { storeToken, getDefaultCredentialsPath } from '../auth/token-storage.js';
import { GITHUB_USER_URL } from '../auth/constants.js';

export interface AuthLoginResult {
  readonly success: boolean;
  readonly message: string;
  readonly username?: string;
}

export async function runAuthLogin(): Promise<AuthLoginResult> {
  try {
    const deviceCode = await requestDeviceCode();

    console.log('\nMoment CLI needs permission to access your GitHub repositories.\n');
    console.log(`1. Open ${deviceCode.verification_uri} in your browser`);
    console.log(`2. Enter code: ${deviceCode.user_code}\n`);

    const token = await pollForToken(
      deviceCode.device_code,
      deviceCode.interval,
      deviceCode.expires_in,
      {
        onUserCode: () => {},
        onPolling: () => process.stdout.write('.'),
      },
    );

    console.log('');

    const filePath = await storeToken(token.access_token, token.token_type, token.scope);

    let username: string | undefined;
    try {
      const res = await fetch(GITHUB_USER_URL, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (res.ok) {
        const user = (await res.json()) as { login: string };
        username = user.login;
      }
    } catch {
      // Non-fatal — we have the token, just can't fetch username
    }

    const userMsg = username ? ` as @${username}` : '';
    return {
      success: true,
      message: `Authenticated${userMsg}\n  Token stored at ${filePath}`,
      username,
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
