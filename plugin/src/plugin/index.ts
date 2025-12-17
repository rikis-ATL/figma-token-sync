import { PluginMessage, UIMessage, PluginSettings, GitHubConfig } from '../shared/types';
import { loadSettings, saveSettings } from './storage';
import { GitHubClient, GitHubAPIError } from './github/api';
import { findTokenFiles, getTokenFiles } from './github/files';
import { parseStyleDictionary, transformTokensToFigma } from './transformers/sd-to-figma';
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
      sendToUI({ type: 'SYNC_PROGRESS', message: 'Validating token file paths...' });

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

    // Step 3: Parse and transform each file
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Parsing token files...' });

    let totalCollections = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const file of fileContents) {
      if (file.error) continue;

      sendToUI({
        type: 'SYNC_PROGRESS',
        message: `Processing ${file.path}...`,
      });

      try {
        // Parse JSON
        const tokens = parseStyleDictionary(file.content);

        // Transform to Figma variables
        const result = transformTokensToFigma(tokens);

        totalCollections += result.collectionsCreated;
        totalCreated += result.variablesCreated;
        totalUpdated += result.variablesUpdated;
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);

        if (!result.success) {
          console.error(`Failed to transform ${file.path}:`, result.errors);
        }
      } catch (error) {
        const errorMsg = `Failed to process ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        allErrors.push(errorMsg);
        console.error(errorMsg);
      }
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

    const transformResult = transformFigmaToTokens({
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
        // Extract directory from first pattern
        const firstPattern = config.tokenPaths[0] || 'tokens';
        const dir = firstPattern.includes('/')
          ? firstPattern.substring(0, firstPattern.lastIndexOf('/'))
          : 'tokens';

        targetPath = `${dir}/${fileName}`;
      }

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
