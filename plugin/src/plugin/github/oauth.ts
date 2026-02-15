export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface AccessTokenError {
  error: string;
  error_description?: string;
}

export class GitHubOAuth {
  private static readonly CLIENT_ID = 'your_github_app_client_id'; // Replace with actual client ID
  private static readonly DEVICE_CODE_URL = 'https://github.com/login/device/code';
  private static readonly ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

  static async startDeviceFlow(): Promise<DeviceCodeResponse> {
    const response = await fetch(GitHubOAuth.DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GitHubOAuth.CLIENT_ID,
        scope: 'repo'
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to start device flow: ${response.statusText}`);
    }

    return response.json();
  }

  static async pollForToken(deviceCode: string, interval: number = 5): Promise<string> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const response = await fetch(GitHubOAuth.ACCESS_TOKEN_URL, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              client_id: GitHubOAuth.CLIENT_ID,
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })
          });

          const data: AccessTokenResponse | AccessTokenError = await response.json();

          if ('access_token' in data) {
            resolve(data.access_token);
            return;
          }

          if ('error' in data) {
            switch (data.error) {
              case 'authorization_pending':
                // Continue polling
                setTimeout(poll, interval * 1000);
                break;
              case 'slow_down':
                // Increase polling interval
                setTimeout(poll, (interval + 5) * 1000);
                break;
              case 'expired_token':
              case 'access_denied':
                reject(new Error(data.error_description || data.error));
                break;
              default:
                reject(new Error(`OAuth error: ${data.error}`));
            }
          }
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }
}