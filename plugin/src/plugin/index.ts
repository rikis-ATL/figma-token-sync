import { PluginMessage, UIMessage, PluginSettings, GitHubConfig } from '../shared/types';
import { loadSettings, saveSettings } from './storage';
import { GitHubClient, GitHubAPIError } from './github/api';
import { findTokenFiles, getTokenFiles } from './github/files';
import { parseStyleDictionary, transformTokensToFigma, resolveTokenReferences } from './transformers/sd-to-figma';
import { getCollectionModes } from './figma-api/variables';
import {
  transformFigmaToTokens,
  formatTokensAsJSON,
  generateChangeSummary,
} from './transformers/figma-to-sd';
import {
  createPullRequest,
  generatePRTitle,
  generatePRBody,
} from './github/pull-requests';

// Show the plugin UI
figma.showUI(__html__, {
  width: 400,
  height: 600,
  themeColors: true,
});

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  console.log('Plugin received message:', msg.type);

  try {
    switch (msg.type) {
      case 'INIT': {
        const settings = await loadSettings();
        sendToUI({ type: 'SETTINGS_LOADED', settings });
        break;
      }

      case 'SAVE_SETTINGS': {
        const success = await saveSettings(msg.settings);
        sendToUI({ type: 'SETTINGS_SAVED', success });
        break;
      }

      case 'TEST_CONNECTION': {
        // Test GitHub connection
        sendToUI({ type: 'SYNC_PROGRESS', message: 'Testing connection...' });
        const result = await testGitHubConnection(msg.config);
        sendToUI({
          type: 'CONNECTION_TESTED',
          success: result.success,
          message: result.message,
        });
        break;
      }

      case 'PULL_FROM_GITHUB': {
        // Pull tokens from GitHub and update Figma
        sendToUI({ type: 'SYNC_STARTED', direction: 'pull' });

        try {
          const pullResult = await pullTokensFromGitHub(msg.config);

          if (pullResult.success) {
            // Update last sync in settings
            const currentSettings = await loadSettings();
            const updatedSettings: PluginSettings = {
              ...currentSettings,
              lastSync: {
                timestamp: Date.now(),
                direction: 'pull',
                status: 'success',
                message: pullResult.message,
              },
            };
            await saveSettings(updatedSettings);
          }

          sendToUI({
            type: 'SYNC_COMPLETE',
            success: pullResult.success,
            message: pullResult.message,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Pull failed';
          sendToUI({
            type: 'SYNC_COMPLETE',
            success: false,
            message: errorMessage,
          });
        }
        break;
      }

      case 'PUSH_TO_GITHUB': {
        // Push Figma variables to GitHub as PR
        sendToUI({ type: 'SYNC_STARTED', direction: 'push' });

        try {
          const pushResult = await pushTokensToGitHub(msg.config);

          if (pushResult.success) {
            // Update last sync in settings
            const currentSettings = await loadSettings();
            const updatedSettings: PluginSettings = {
              ...currentSettings,
              lastSync: {
                timestamp: Date.now(),
                direction: 'push',
                status: 'success',
                message: pushResult.message,
              },
            };
            await saveSettings(updatedSettings);
          }

          sendToUI({
            type: 'SYNC_COMPLETE',
            success: pushResult.success,
            message: pushResult.message,
            prUrl: pushResult.prUrl,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Push failed';
          sendToUI({
            type: 'SYNC_COMPLETE',
            success: false,
            message: errorMessage,
          });
        }
        break;
      }

      case 'GET_COLLECTION_MODES': {
        // Get modes for a specific collection
        try {
          const modes = await getCollectionModes(msg.collectionName);
          sendToUI({
            type: 'COLLECTION_MODES',
            modes,
          });
        } catch (error) {
          console.error('Failed to get collection modes:', error);
          sendToUI({
            type: 'COLLECTION_MODES',
            modes: [],
          });
        }
        break;
      }

      default:
        console.warn('Unknown message type:', (msg as any).type);
    }
  } catch (error) {
    console.error('Error handling message:', error);

    // Enhanced error handling
    let errorMessage = 'Unknown error occurred';
    if (error instanceof GitHubAPIError) {
      errorMessage = `GitHub API Error: ${error.message}`;
      if (error.status) {
        errorMessage += ` (Status: ${error.status})`;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    sendToUI({
      type: 'ERROR',
      message: errorMessage,
    });
  }
};

// Helper to send messages to UI
function sendToUI(message: UIMessage) {
  figma.ui.postMessage(message);
}

// Test GitHub connection with comprehensive validation
async function testGitHubConnection(
  config: GitHubConfig
): Promise<{ success: boolean; message: string }> {
  try {
    const client = new GitHubClient(config);

    // Run comprehensive connection test
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Verifying credentials...' });
    const testResult = await client.testConnection();

    if (!testResult.success) {
      return testResult;
    }

    // Additional validation: check token file paths
    if (config.tokenPaths && config.tokenPaths.length > 0) {
      sendToUI({ type: 'SYNC_PROGRESS', message: 'Exploring repository structure...' });

      // First, let's see what's in the root directory
      try {
        console.log('🔍 Attempting to list root directory...');
        const rootResponse = await client.request<any>(
          `/repos/${config.owner}/${config.repo}/contents?ref=${config.branch || 'main'}`
        );
        console.log('🗂️ Raw root response type:', typeof rootResponse, Array.isArray(rootResponse));
        console.log('🗂️ Raw root response sample:', rootResponse[0] || rootResponse);

        const rootFiles = Array.isArray(rootResponse) ? rootResponse : [rootResponse];
        console.log('🗂️ Repository root contents:', rootFiles.map(f => `${f.name || f.filename || 'unknown'} (${f.type || 'unknown'})`));
        sendToUI({ type: 'SYNC_PROGRESS', message: `Repository has ${rootFiles.length} items in root: ${rootFiles.slice(0, 5).map(f => f.name).join(', ')}${rootFiles.length > 5 ? '...' : ''}` });
      } catch (error) {
        console.error('Failed to list root directory:', error);
        sendToUI({ type: 'SYNC_PROGRESS', message: 'Could not explore repository structure (continuing...)' });
      }

      sendToUI({ type: 'SYNC_PROGRESS', message: 'Searching for token files...' });

      // Find token files matching the patterns
      const tokenFiles = await findTokenFiles(client, config.tokenPaths, config.branch);

      if (tokenFiles.length === 0) {
        return {
          success: false,
          message: `No token files found matching patterns: ${config.tokenPaths.join(', ')}`,
        };
      }

      // Validate paths exist
      const validation = await client.validateTokenPaths(tokenFiles);
      const missingFiles = validation.results.filter((r) => !r.exists);

      if (missingFiles.length > 0) {
        return {
          success: false,
          message: `Missing token files: ${missingFiles.map((f) => f.path).join(', ')}`,
        };
      }

      const details = testResult.details!;
      return {
        success: true,
        message: `✓ Connected as ${details.user} to ${details.repo} (${details.branch})\n✓ Found ${tokenFiles.length} token file(s)\n✓ Write access: ${details.hasWriteAccess ? 'Yes' : 'No'}`,
      };
    }

    // No token paths to validate
    const details = testResult.details!;
    return {
      success: true,
      message: `✓ Connected as ${details.user} to ${details.repo} (${details.branch})\n✓ Write access: ${details.hasWriteAccess ? 'Yes' : 'No'}`,
    };
  } catch (error) {
    if (error instanceof GitHubAPIError) {
      return {
        success: false,
        message: error.message,
      };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection test failed',
    };
  }
}

// Pull tokens from GitHub and update Figma variables
async function pullTokensFromGitHub(
  config: GitHubConfig
): Promise<{ success: boolean; message: string }> {
  try {
    const client = new GitHubClient(config);

    // Step 1: Find token files
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Finding token files...' });
    const tokenFiles = await findTokenFiles(client, config.tokenPaths, config.branch);

    if (tokenFiles.length === 0) {
      return {
        success: false,
        message: `No token files found matching patterns: ${config.tokenPaths.join(', ')}`,
      };
    }

    sendToUI({
      type: 'SYNC_PROGRESS',
      message: `Found ${tokenFiles.length} token file(s)`,
    });

    // Step 2: Fetch token files
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Fetching token files...' });
    const fileContents = await getTokenFiles(client, tokenFiles, config.branch);

    // Check for errors
    const failedFiles = fileContents.filter((f) => f.error);
    if (failedFiles.length > 0) {
      return {
        success: false,
        message: `Failed to fetch files:\n${failedFiles.map((f) => `- ${f.path}: ${f.error}`).join('\n')}`,
      };
    }

    // Step 3: Parse and merge all token files first
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Parsing token files...' });

    const allTokens: any = {};
    const parsedFiles: Array<{ path: string; tokens: any }> = [];

    // First pass: Parse all files and merge into global token object
    for (const file of fileContents) {
      if (file.error) continue;

      try {
        // Clean and validate JSON content
        let cleanContent = file.content.trim();

        // Remove any BOM or hidden characters
        cleanContent = cleanContent.replace(/^\uFEFF/, ''); // Remove BOM
        cleanContent = cleanContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ''); // Remove control chars

        console.log(`📄 Cleaned content for ${file.path} (length: ${cleanContent.length}):`, cleanContent.substring(0, 200));

        // Parse JSON (without reference resolution yet)
        const rawTokens = JSON.parse(cleanContent);
        if (!rawTokens || typeof rawTokens !== 'object') {
          throw new Error('Invalid token file: expected JSON object');
        }

        // Deep merge into allTokens object
        Object.assign(allTokens, rawTokens);
        parsedFiles.push({ path: file.path, tokens: rawTokens });

        console.log(`📦 Merged tokens from ${file.path}`);
      } catch (error) {
        console.error(`Failed to parse ${file.path}:`, error);
        // Continue with other files
      }
    }

    // Resolve all references globally
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Resolving token references...' });
    const resolvedGlobalTokens = resolveTokenReferences(allTokens);

    console.log(`🔗 Resolved ${Object.keys(allTokens).length} top-level token groups`);

    // Step 4: Transform resolved tokens to Figma variables
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Creating Figma variables...' });

    let totalCollections = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    try {
      // Transform all resolved tokens at once
      const transformOptions = {
        collectionName: config.targetCollection || undefined,
        targetMode: config.targetMode || undefined
      };

      console.log(`🎯 Transform options:`, transformOptions);

      const result = await transformTokensToFigma(resolvedGlobalTokens, transformOptions);

      totalCollections += result.collectionsCreated;
      totalCreated += result.variablesCreated;
      totalUpdated += result.variablesUpdated;
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);

      if (!result.success) {
        console.error('Failed to transform tokens:', result.errors);
      }
    } catch (error) {
      const errorMsg = `Failed to process tokens: ${error instanceof Error ? error.message : 'Unknown error'}`;
      allErrors.push(errorMsg);
      console.error(errorMsg);
    }

    // Step 4: Report results
    if (allErrors.length > 0) {
      return {
        success: false,
        message: `Sync completed with errors:\n${allErrors.slice(0, 5).join('\n')}${allErrors.length > 5 ? `\n... and ${allErrors.length - 5} more errors` : ''}`,
      };
    }

    const summary = [
      `✓ Successfully imported ${fileContents.length} token file(s)`,
      `✓ Collections: ${totalCollections} created`,
      `✓ Variables: ${totalCreated} created, ${totalUpdated} updated`,
    ];

    if (allWarnings.length > 0) {
      summary.push(`⚠ Warnings: ${allWarnings.length}`);
    }

    return {
      success: true,
      message: summary.join('\n'),
    };
  } catch (error) {
    console.error('Pull failed:', error);

    if (error instanceof GitHubAPIError) {
      return {
        success: false,
        message: `GitHub API Error: ${error.message}`,
      };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Pull failed',
    };
  }
}

// Push Figma variables to GitHub as Pull Request
async function pushTokensToGitHub(
  config: GitHubConfig
): Promise<{ success: boolean; message: string; prUrl?: string }> {
  try {
    const client = new GitHubClient(config);

    // Step 1: Read Figma variables
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Reading Figma variables...' });

    const transformResult = await transformFigmaToTokens({
      organizeByCollection: true, // Create separate files per collection
    });

    if (!transformResult.success) {
      return {
        success: false,
        message: `Failed to read variables:\n${transformResult.errors.join('\n')}`,
      };
    }

    if (transformResult.variablesProcessed === 0) {
      return {
        success: false,
        message: 'No variables found in this file. Create some variables first!',
      };
    }

    sendToUI({
      type: 'SYNC_PROGRESS',
      message: `Read ${transformResult.variablesProcessed} variables from ${transformResult.collectionsProcessed} collection(s)`,
    });

    // Step 2: Determine target file paths
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Preparing token files...' });

    const files: Array<{ path: string; content: string }> = [];

    // Map collection files to configured paths
    for (const [fileName, tokens] of Object.entries(transformResult.tokens)) {
      // Determine file path
      let targetPath: string;

      if (config.tokenPaths.length === 1 && !config.tokenPaths[0].includes('*')) {
        // Single specific file - use it
        targetPath = config.tokenPaths[0];
      } else {
        // Multiple files or glob pattern - use collection-based naming
        // Extract directory from first pattern, handling glob patterns
        const firstPattern = config.tokenPaths[0] || 'tokens/**/*.json';

        // Extract base directory from glob pattern
        let baseDir = 'tokens';
        if (firstPattern.includes('/')) {
          // For patterns like "tokens/**/*.json" or "tokens/globals/*.json"
          const parts = firstPattern.split('/');
          // Find the first part that doesn't contain wildcards
          const nonWildcardParts = parts.filter(part => !part.includes('*'));
          if (nonWildcardParts.length > 0) {
            baseDir = nonWildcardParts.join('/');
          } else {
            // If all parts have wildcards, use first part
            baseDir = parts[0] === '.' ? 'tokens' : parts[0];
          }
        }

        targetPath = `${baseDir}/${fileName}`;
      }

      console.log(`📁 Generated file path: ${targetPath} for collection file: ${fileName}`);

      const content = formatTokensAsJSON(tokens);
      files.push({ path: targetPath, content });
    }

    // Step 3: Fetch current files to generate changelog
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Generating changelog...' });

    let totalChanges = {
      added: [] as string[],
      modified: [] as string[],
      removed: [] as string[],
    };

    for (const file of files) {
      try {
        const currentFile = await getTokenFiles(client, [file.path], config.branch);

        if (currentFile[0] && !currentFile[0].error) {
          // File exists, compare changes
          const oldTokens = parseStyleDictionary(currentFile[0].content);
          const newTokens = JSON.parse(file.content);
          const changes = generateChangeSummary(oldTokens, newTokens);

          totalChanges.added.push(...changes.added);
          totalChanges.modified.push(...changes.modified);
          totalChanges.removed.push(...changes.removed);
        } else {
          // New file - all tokens are "added"
          const newTokens = JSON.parse(file.content);
          // Count all tokens in the new file as added
          const countTokens = (obj: any): number => {
            let count = 0;
            for (const value of Object.values(obj)) {
              if (value && typeof value === 'object' && 'value' in value) {
                count++;
              } else if (value && typeof value === 'object') {
                count += countTokens(value);
              }
            }
            return count;
          };
          const tokenCount = countTokens(newTokens);
          totalChanges.added.push(`${file.path} (${tokenCount} tokens)`);
        }
      } catch (error) {
        console.warn(`Could not fetch ${file.path} for comparison:`, error);
        // Continue without changelog for this file
      }
    }

    // Step 4: Create Pull Request
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Creating Pull Request...' });

    const prTitle = generatePRTitle(totalChanges);
    const prBody = generatePRBody(totalChanges, {
      collectionsProcessed: transformResult.collectionsProcessed,
      variablesProcessed: transformResult.variablesProcessed,
    });

    const prResult = await createPullRequest(client, {
      title: prTitle,
      body: prBody,
      baseBranch: config.branch || 'main',
      files,
    });

    if (!prResult.success) {
      return {
        success: false,
        message: prResult.message,
      };
    }

    // Step 5: Success!
    const summary = [
      `✓ Successfully created Pull Request`,
      `✓ Files: ${files.length} updated`,
      `✓ Variables: ${transformResult.variablesProcessed} exported`,
      `✓ PR: ${prResult.prUrl}`,
    ];

    return {
      success: true,
      message: summary.join('\n'),
      prUrl: prResult.prUrl,
    };
  } catch (error) {
    console.error('Push failed:', error);

    if (error instanceof GitHubAPIError) {
      return {
        success: false,
        message: `GitHub API Error: ${error.message}`,
      };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Push failed',
    };
  }
}
