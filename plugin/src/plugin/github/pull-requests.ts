/**
 * GitHub Pull Request creation and management
 */

import { GitHubClient } from './api';
import { getRef, createBranch, updateFile } from './files';

export interface CreatePROptions {
  title: string;
  body: string;
  baseBranch: string;
  files: Array<{
    path: string;
    content: string;
  }>;
}

export interface CreatePRResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  message: string;
}

/**
 * Create a pull request with file changes
 */
export async function createPullRequest(
  client: GitHubClient,
  options: CreatePROptions
): Promise<CreatePRResult> {
  const config = (client as any).config;

  try {
    // Step 1: Get base branch reference
    const baseRef = await getRef(client, options.baseBranch);
    const baseSha = baseRef.object.sha;

    // Step 2: Create new branch with timestamp
    const timestamp = Date.now();
    const newBranchName = `figma-tokens-${timestamp}`;

    await createBranch(client, newBranchName, baseSha);
    console.log(`Created branch: ${newBranchName}`);

    // Step 3: Get current file SHAs and update files on new branch
    for (const file of options.files) {
      try {
        // Get current file SHA (if exists)
        let fileSha = '';
        try {
          const fileContent = await client.request<any>(
            `/repos/${config.owner}/${config.repo}/contents/${file.path}?ref=${options.baseBranch}`
          );
          fileSha = fileContent.sha;
        } catch (error) {
          // File doesn't exist, that's ok - we'll create it
          console.log(`File ${file.path} doesn't exist, will create new`);
        }

        // Update or create file on new branch
        await updateFile(client, {
          path: file.path,
          content: file.content,
          message: `Update ${file.path} from Figma`,
          sha: fileSha,
          branch: newBranchName,
        });

        console.log(`Updated ${file.path} on branch ${newBranchName}`);
      } catch (error) {
        console.error(`Failed to update ${file.path}:`, error);
        throw new Error(
          `Failed to update ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Step 4: Create pull request
    const prResponse = await client.request<any>(
      `/repos/${config.owner}/${config.repo}/pulls`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: options.title,
          body: options.body,
          head: newBranchName,
          base: options.baseBranch,
        }),
      }
    );

    return {
      success: true,
      prUrl: prResponse.html_url,
      prNumber: prResponse.number,
      message: `Pull request created: ${prResponse.html_url}`,
    };
  } catch (error) {
    console.error('Failed to create PR:', error);
    return {
      success: false,
      message: `Failed to create pull request: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Generate PR title from changes
 */
export function generatePRTitle(changes: {
  added: string[];
  modified: string[];
  removed: string[];
}): string {
  const total = changes.added.length + changes.modified.length + changes.removed.length;

  if (total === 0) {
    return 'Update design tokens from Figma';
  }

  const parts: string[] = [];

  if (changes.added.length > 0) {
    parts.push(`${changes.added.length} added`);
  }
  if (changes.modified.length > 0) {
    parts.push(`${changes.modified.length} modified`);
  }
  if (changes.removed.length > 0) {
    parts.push(`${changes.removed.length} removed`);
  }

  return `Update design tokens from Figma (${parts.join(', ')})`;
}

/**
 * Generate PR description with changelog
 */
export function generatePRBody(
  changes: {
    added: string[];
    modified: string[];
    removed: string[];
  },
  options: {
    collectionsProcessed: number;
    variablesProcessed: number;
  }
): string {
  const lines: string[] = [];

  lines.push('## Summary');
  lines.push('');
  lines.push('This PR updates design tokens exported from Figma variables.');
  lines.push('');
  lines.push(`- **Collections processed:** ${options.collectionsProcessed}`);
  lines.push(`- **Variables processed:** ${options.variablesProcessed}`);
  lines.push('');

  // Changes section
  const hasChanges =
    changes.added.length > 0 ||
    changes.modified.length > 0 ||
    changes.removed.length > 0;

  if (hasChanges) {
    lines.push('## Changes');
    lines.push('');

    if (changes.added.length > 0) {
      lines.push(`### ✨ Added (${changes.added.length})`);
      lines.push('');
      changes.added.slice(0, 20).forEach((token) => {
        lines.push(`- \`${token}\``);
      });
      if (changes.added.length > 20) {
        lines.push(`- ... and ${changes.added.length - 20} more`);
      }
      lines.push('');
    }

    if (changes.modified.length > 0) {
      lines.push(`### 🔄 Modified (${changes.modified.length})`);
      lines.push('');
      changes.modified.slice(0, 20).forEach((token) => {
        lines.push(`- \`${token}\``);
      });
      if (changes.modified.length > 20) {
        lines.push(`- ... and ${changes.modified.length - 20} more`);
      }
      lines.push('');
    }

    if (changes.removed.length > 0) {
      lines.push(`### ❌ Removed (${changes.removed.length})`);
      lines.push('');
      changes.removed.slice(0, 20).forEach((token) => {
        lines.push(`- \`${token}\``);
      });
      if (changes.removed.length > 20) {
        lines.push(`- ... and ${changes.removed.length - 20} more`);
      }
      lines.push('');
    }
  } else {
    lines.push('## Changes');
    lines.push('');
    lines.push('No token changes detected (formatting or structure updates only).');
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('🤖 Generated with [Claude Code](https://claude.com/claude-code)');
  lines.push('');
  lines.push('**Note:** Please review the changes carefully before merging.');

  return lines.join('\n');
}
