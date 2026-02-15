/**
 * GitHub API client with authentication and error handling
 */

export interface GitHubError {
  message: string;
  status?: number;
  documentation_url?: string;
}

export class GitHubAPIError extends Error {
  status?: number;
  documentation_url?: string;

  constructor(message: string, status?: number, documentation_url?: string) {
    super(message);
    this.name = 'GitHubAPIError';
    this.status = status;
    this.documentation_url = documentation_url;
  }
}

import { GitHubConfig } from '../../shared/types';

export class GitHubClient {
  private config: GitHubConfig;
  private baseUrl = 'https://api.github.com';

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  /**
   * Get configuration details
   */
  getConfig(): GitHubConfig {
    return this.config;
  }

  /**
   * Get the authentication token (either personal access token or OAuth token)
   */
  private getAuthToken(): string {
    return this.config.oauthToken || this.config.token || '';
  }

  /**
   * Make an authenticated request to GitHub API
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const authToken = this.getAuthToken();
    if (!authToken) {
      throw new GitHubAPIError('No authentication token provided');
    }

    const headers: HeadersInit = {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle rate limiting
      if (response.status === 429) {
        const resetTime = response.headers?.get('X-RateLimit-Reset');
        throw new GitHubAPIError(
          `Rate limit exceeded. Resets at ${resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleString() : 'unknown'}`,
          429
        );
      }

      // Parse response body
      const contentType = response.headers?.get('content-type');
      let data: any;

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        // Try to parse as JSON even if content-type is wrong
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      // Handle errors
      if (!response.ok) {
        const errorMessage = data?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new GitHubAPIError(
          errorMessage,
          response.status,
          data?.documentation_url
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        throw error;
      }

      // Network or other errors
      throw new GitHubAPIError(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  }

  /**
   * Get repository information
   */
  async getRepository(): Promise<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    permissions?: {
      admin: boolean;
      push: boolean;
      pull: boolean;
    };
  }> {
    return this.request(`/repos/${this.config.owner}/${this.config.repo}`);
  }

  /**
   * Get branch information
   */
  async getBranch(branch?: string): Promise<{
    name: string;
    commit: {
      sha: string;
      url: string;
    };
    protected: boolean;
  }> {
    const branchName = branch || this.config.branch || 'main';
    return this.request(`/repos/${this.config.owner}/${this.config.repo}/branches/${branchName}`);
  }

  /**
   * Get authenticated user information
   */
  async getUser(): Promise<{
    login: string;
    id: number;
    name: string;
    email: string;
  }> {
    return this.request('/user');
  }

  /**
   * Test connection to GitHub with current credentials
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    details?: {
      user: string;
      repo: string;
      branch: string;
      hasWriteAccess: boolean;
    };
  }> {
    try {
      // Test 1: Verify token is valid
      const user = await this.getUser();

      // Test 2: Verify repository exists and is accessible
      const repo = await this.getRepository();

      // Test 3: Verify branch exists
      const branch = await this.getBranch();

      // Check write access
      const hasWriteAccess = repo.permissions?.push || repo.permissions?.admin || false;

      return {
        success: true,
        message: `Connected as ${user.login} to ${repo.full_name}`,
        details: {
          user: user.login,
          repo: repo.full_name,
          branch: branch.name,
          hasWriteAccess,
        },
      };
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        let message = error.message;

        // Provide more helpful error messages
        if (error.status === 401) {
          message = 'Invalid token. Please check your Personal Access Token.';
        } else if (error.status === 404) {
          message = 'Repository not found. Check owner/repo or token permissions.';
        } else if (error.status === 403) {
          message = 'Access forbidden. Your token may lack required permissions.';
        }

        return {
          success: false,
          message,
        };
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * Validate token file paths exist in repository
   */
  async validateTokenPaths(paths: string[]): Promise<{
    valid: boolean;
    results: Array<{
      path: string;
      exists: boolean;
      error?: string;
    }>;
  }> {
    const results = await Promise.all(
      paths.map(async (path) => {
        try {
          // Try to get file contents to verify it exists
          await this.request(
            `/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch || 'main'}`
          );
          return { path, exists: true };
        } catch (error) {
          if (error instanceof GitHubAPIError && error.status === 404) {
            return { path, exists: false, error: 'File not found' };
          }
          return {
            path,
            exists: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return {
      valid: results.every((r) => r.exists),
      results,
    };
  }
}
