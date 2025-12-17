/**
 * GitHub file operations for token management
 */

import { GitHubClient } from './api';

export interface FileContent {
  content: string; // Base64 encoded
  sha: string; // Required for updates
  size: number;
  name: string;
  path: string;
  encoding: string;
}

export interface DecodedFileContent {
  content: string; // Decoded content
  sha: string;
  path: string;
}

export interface UpdateFileRequest {
  path: string;
  content: string; // Plain text, will be base64 encoded
  message: string;
  sha: string; // Required for updates
  branch: string;
}

/**
 * Get file contents from GitHub repository
 */
export async function getFileContents(
  client: GitHubClient,
  path: string,
  ref?: string
): Promise<DecodedFileContent> {
  const config = (client as any).config;
  const branch = ref || config.branch || 'main';

  const response = await client.request<FileContent>(
    `/repos/${config.owner}/${config.repo}/contents/${path}?ref=${branch}`
  );

  // Decode base64 content
  const decodedContent = atob(response.content.replace(/\n/g, ''));

  return {
    content: decodedContent,
    sha: response.sha,
    path: response.path,
  };
}

/**
 * Get multiple token files from repository
 */
export async function getTokenFiles(
  client: GitHubClient,
  paths: string[],
  ref?: string
): Promise<Array<DecodedFileContent & { error?: string }>> {
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        return await getFileContents(client, path, ref);
      } catch (error) {
        return {
          content: '',
          sha: '',
          path,
          error: error instanceof Error ? error.message : 'Failed to fetch file',
        };
      }
    })
  );

  return results;
}

/**
 * Update a file in the GitHub repository
 */
export async function updateFile(
  client: GitHubClient,
  request: UpdateFileRequest
): Promise<{ commit: { sha: string }; content: { sha: string } }> {
  const config = (client as any).config;

  // Encode content to base64
  const encodedContent = btoa(request.content);

  const body = {
    message: request.message,
    content: encodedContent,
    sha: request.sha,
    branch: request.branch,
  };

  return client.request(
    `/repos/${config.owner}/${config.repo}/contents/${request.path}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    }
  );
}

/**
 * Get reference (branch/tag) information
 */
export async function getRef(
  client: GitHubClient,
  ref: string
): Promise<{ ref: string; object: { sha: string; type: string } }> {
  const config = (client as any).config;

  return client.request(
    `/repos/${config.owner}/${config.repo}/git/refs/heads/${ref}`
  );
}

/**
 * Create a new branch
 */
export async function createBranch(
  client: GitHubClient,
  branchName: string,
  fromSha: string
): Promise<{ ref: string; object: { sha: string } }> {
  const config = (client as any).config;

  return client.request(`/repos/${config.owner}/${config.repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    }),
  });
}

/**
 * List files in a directory
 */
export async function listDirectory(
  client: GitHubClient,
  path: string,
  ref?: string
): Promise<Array<{ name: string; path: string; type: 'file' | 'dir'; sha: string }>> {
  const config = (client as any).config;
  const branch = ref || config.branch || 'main';

  const response = await client.request<any[]>(
    `/repos/${config.owner}/${config.repo}/contents/${path}?ref=${branch}`
  );

  return response.map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type,
    sha: item.sha,
  }));
}

/**
 * Search for token files using glob patterns
 * Note: This is a simple implementation - for production, consider using GitHub's search API
 */
export async function findTokenFiles(
  client: GitHubClient,
  patterns: string[],
  ref?: string
): Promise<string[]> {
  const foundFiles: string[] = [];

  for (const pattern of patterns) {
    // Simple glob handling - just handle basic patterns
    if (pattern.includes('*')) {
      // For patterns like 'tokens/*.json', list the directory
      const dir = pattern.split('*')[0].replace(/\/$/, '');
      try {
        const files = await listDirectory(client, dir, ref);
        const jsonFiles = files
          .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
          .map((f) => f.path);
        foundFiles.push(...jsonFiles);
      } catch (error) {
        console.warn(`Failed to list directory ${dir}:`, error);
      }
    } else {
      // Direct file path
      foundFiles.push(pattern);
    }
  }

  return [...new Set(foundFiles)]; // Remove duplicates
}
