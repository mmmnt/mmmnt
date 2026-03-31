/**
 * GitHub OAuth Device Flow — ADR-026
 *
 * Implements RFC 8628 device authorization grant for CLI authentication.
 */

import { getClientId, GITHUB_DEVICE_CODE_URL, GITHUB_TOKEN_URL, TOKEN_SCOPE } from './constants.js';

export interface DeviceCodeResponse {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly expires_in: number;
  readonly interval: number;
}

export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly scope: string;
}

export interface DeviceFlowCallbacks {
  onUserCode(userCode: string, verificationUri: string): void;
  onPolling(): void;
}

async function postJson<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const clientId = getClientId();

  return postJson<DeviceCodeResponse>(GITHUB_DEVICE_CODE_URL, {
    client_id: clientId,
    scope: TOKEN_SCOPE,
  });
}

export async function pollForToken(
  deviceCode: string,
  interval: number,
  expiresIn: number,
  callbacks: DeviceFlowCallbacks,
): Promise<TokenResponse> {
  const clientId = getClientId();
  const deadline = Date.now() + expiresIn * 1000;
  let pollInterval = interval * 1000;

  while (Date.now() < deadline) {
    await sleep(pollInterval);
    callbacks.onPolling();

    const body = await postJson<Record<string, string>>(GITHUB_TOKEN_URL, {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    if (body.access_token) {
      return body as unknown as TokenResponse;
    }

    switch (body.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        // AUTH-02: Increase interval by 5 seconds
        pollInterval += 5000;
        continue;
      case 'expired_token':
        throw new Error('Device code expired. Please try again.');
      case 'access_denied':
        throw new Error('Authorization denied by user.');
      default:
        throw new Error(`Unexpected error: ${body.error ?? 'unknown'}`);
    }
  }

  throw new Error('Device code expired. Please try again.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
