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
  const config = client.getConfig();
  const branch = ref || config.branch || 'main';

  const response = await client.request<any>(
    `/repos/${config.owner}/${config.repo}/contents/${path}?ref=${branch}`
  );

  console.log(`📄 Raw file response for ${path}:`, typeof response, response);
  console.log(`📄 Response keys:`, Object.keys(response));
  console.log(`📄 Has content field:`, 'content' in response);
  console.log(`📄 File size:`, response.size);

  // Handle different response formats
  const fileData = Array.isArray(response) ? response[0] : response;

  // Check if file is too large for direct API access (over 1MB)
  if (fileData.size > 1048576) {
    throw new Error(`File ${path} is too large (${fileData.size} bytes). GitHub API doesn't return content for files over 1MB.`);
  }

  // If no content field, the file might need a different fetch approach
  if (!fileData.content) {
    console.log(`📄 File metadata only, attempting download_url:`, fileData.download_url);

    if (fileData.download_url) {
      // Use raw file URL to get content
      const rawResponse = await fetch(fileData.download_url);
      if (!rawResponse.ok) {
        throw new Error(`Failed to fetch raw content for ${path}: ${rawResponse.status} ${rawResponse.statusText}`);
      }
      const rawContent = await rawResponse.text();

      return {
        content: rawContent,
        sha: fileData.sha || 'unknown',
        path: fileData.path || path,
      };
    }

    throw new Error(`No content found for file ${path} and no download_url available`);
  }

  // Decode base64 content
  console.log(`📄 Content type for ${path}:`, typeof fileData.content);
  console.log(`📄 Content encoding for ${path}:`, fileData.encoding);
  console.log(`📄 Content preview for ${path}:`, String(fileData.content).substring(0, 100));

  const contentString = typeof fileData.content === 'string' ? fileData.content : String(fileData.content);

  try {
    // Clean base64 string
    const cleanBase64 = contentString.replace(/\n/g, '').replace(/\s/g, '');

    // Custom base64 decoder for Figma plugin environment
    function decodeBase64(base64: string): string {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      let i = 0;

      // Remove padding
      base64 = base64.replace(/=+$/, '');

      while (i < base64.length) {
        const encoded1 = chars.indexOf(base64.charAt(i++));
        const encoded2 = chars.indexOf(base64.charAt(i++));
        const encoded3 = chars.indexOf(base64.charAt(i++));
        const encoded4 = chars.indexOf(base64.charAt(i++));

        const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;

        result += String.fromCharCode((bitmap >> 16) & 255);
        if (encoded3 !== -1) result += String.fromCharCode((bitmap >> 8) & 255);
        if (encoded4 !== -1) result += String.fromCharCode(bitmap & 255);
      }

      return result;
    }

    // Decode base64 content
    let decodedContent: string;

    if (typeof atob !== 'undefined') {
      // Browser environment
      decodedContent = atob(cleanBase64);
    } else {
      // Figma plugin environment - use custom decoder
      decodedContent = decodeBase64(cleanBase64);
    }

    console.log(`📄 Successfully decoded ${path}, length: ${decodedContent.length}`);
    console.log(`📄 Content preview for ${path}:`, decodedContent.substring(0, 100));

    return {
      content: decodedContent,
      sha: fileData.sha || 'unknown',
      path: fileData.path || path,
    };
  } catch (error) {
    console.error(`📄 Failed to decode base64 content for ${path}:`, error);
    throw new Error(`Failed to decode content for ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
/**
 * Encode text to base64 (Figma plugin compatible)
 */
function encodeBase64(text: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;

  while (i < text.length) {
    const a = text.charCodeAt(i++);
    const b = i < text.length ? text.charCodeAt(i++) : 0;
    const c = i < text.length ? text.charCodeAt(i++) : 0;

    const bitmap = (a << 16) | (b << 8) | c;

    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += i - 2 < text.length ? chars.charAt((bitmap >> 6) & 63) : '=';
    result += i - 1 < text.length ? chars.charAt(bitmap & 63) : '=';
  }

  return result;
}

export async function updateFile(
  client: GitHubClient,
  request: UpdateFileRequest
): Promise<{ commit: { sha: string }; content: { sha: string } }> {
  const config = client.getConfig();

  // Encode content to base64 using our custom encoder
  let encodedContent: string;

  if (typeof btoa !== 'undefined') {
    // Browser environment
    encodedContent = btoa(request.content);
  } else {
    // Figma plugin environment - use custom encoder
    encodedContent = encodeBase64(request.content);
  }

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
  const config = client.getConfig();

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
  const config = client.getConfig();

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
  const config = client.getConfig();
  const branch = ref || config.branch || 'main';

  const response = await client.request<any>(
    `/repos/${config.owner}/${config.repo}/contents/${path}?ref=${branch}`
  );

  // Handle both single file and directory responses
  const items = Array.isArray(response) ? response : [response];

  console.log(`📋 Raw GitHub API response for ${path}:`, items.length, 'items');
  if (items.length > 0) {
    console.log(`📋 Sample item structure:`, items[0]);
  }

  return items.map((item) => ({
    name: item.name || item.filename || 'unknown',
    path: item.path || item.full_name || 'unknown',
    type: item.type || 'unknown',
    sha: item.sha || 'unknown',
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

  console.log(`🔍 Searching for token files with patterns: ${patterns.join(', ')}`);

  for (const pattern of patterns) {
    console.log(`📂 Processing pattern: ${pattern}`);

    if (pattern.includes('*')) {
      if (pattern.includes('**')) {
        // Recursive pattern like 'tokens/**/*.json'
        const basePath = pattern.split('**')[0].replace(/\/$/, '');
        console.log(`🔄 Recursive search in: ${basePath || 'root'}`);

        try {
          const allFiles = await findFilesRecursively(client, basePath || '', ref);
          console.log(`📋 Found ${allFiles.length} total files in ${basePath || 'root'}`);

          const jsonFiles = allFiles.filter((f) => f.endsWith('.json'));
          console.log(`📄 Found ${jsonFiles.length} JSON files: ${jsonFiles.join(', ')}`);

          foundFiles.push(...jsonFiles);
        } catch (error) {
          console.error(`❌ Failed recursive search in ${basePath}:`, error);
        }
      } else {
        // Simple pattern like 'tokens/*.json'
        const dir = pattern.split('*')[0].replace(/\/$/, '');
        console.log(`📁 Listing directory: ${dir || 'root'}`);

        try {
          const files = await listDirectory(client, dir, ref);
          console.log(`📋 Found ${files.length} items in ${dir || 'root'}:`, files.map(f => `${f.name} (${f.type})`));

          const jsonFiles = files
            .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
            .map((f) => f.path);
          console.log(`📄 Filtered to ${jsonFiles.length} JSON files: ${jsonFiles.join(', ')}`);

          foundFiles.push(...jsonFiles);
        } catch (error) {
          console.error(`❌ Failed to list directory ${dir}:`, error);
        }
      }
    } else {
      // Direct file path
      console.log(`📌 Adding direct file path: ${pattern}`);
      foundFiles.push(pattern);
    }
  }

  const uniqueFiles = [...new Set(foundFiles)];
  console.log(`✅ Final result: ${uniqueFiles.length} unique files found: ${uniqueFiles.join(', ')}`);

  return uniqueFiles;
}

/**
 * Recursively find all files in a directory and subdirectories
 */
async function findFilesRecursively(
  client: GitHubClient,
  basePath: string,
  ref?: string,
  allFiles: string[] = []
): Promise<string[]> {
  try {
    const items = await listDirectory(client, basePath, ref);

    for (const item of items) {
      if (item.type === 'file') {
        allFiles.push(item.path);
      } else if (item.type === 'dir') {
        // Recursively search subdirectories
        await findFilesRecursively(client, item.path, ref, allFiles);
      }
    }
  } catch (error) {
    console.warn(`Failed to list directory ${basePath}:`, error);
  }

  return allFiles;
}
