import { PluginMessage, UIMessage, PluginSettings, GitHubConfig, FileStructureMapping } from '../shared/types';
import { loadSettings, saveSettings } from './storage';
import { GitHubClient, GitHubAPIError } from './github/api';
import { GitHubOAuth } from './github/oauth';
import { findTokenFiles, getTokenFiles } from './github/files';
import {
  parseStyleDictionary,
  transformTokensToFigma,
  transformMultiBrandTokensToFigma,
  resolveTokenReferences
} from './transformers/sd-to-figma';
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
import {
  detectMultiBrandStructure,
  categorizeTokenFiles,
  isMultiBrand,
  getBrandNames,
  deepMerge,
} from '../shared/multi-brand-utils';

console.log('🚀 Plugin loading - Figma Token Sync Plugin Started!');
console.log('🚀 Build timestamp:', new Date().toISOString());

// Show the plugin UI
figma.showUI(__html__, {
  width: 400,
  height: 600,
  themeColors: true,
});

console.log('🚀 UI shown');

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
        console.log('🔗 Plugin received TEST_CONNECTION with config:', {
          hasToken: !!msg.config.token,
          hasOAuthToken: !!msg.config.oauthToken,
          token: msg.config.token ? `${msg.config.token.substring(0, 4)}...${msg.config.token.substring(msg.config.token.length - 4)}` : 'none',
          oauthToken: msg.config.oauthToken ? `${msg.config.oauthToken.substring(0, 4)}...${msg.config.oauthToken.substring(msg.config.oauthToken.length - 4)}` : 'none',
          owner: msg.config.owner,
          repo: msg.config.repo,
          branch: msg.config.branch
        });
        sendToUI({ type: 'SYNC_PROGRESS', message: 'Testing connection...' });
        const result = await testGitHubConnection(msg.config);
        console.log('🔗 Test connection result:', result);
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

      case 'START_OAUTH_FLOW': {
        // Start GitHub OAuth device flow
        try {
          sendToUI({ type: 'SYNC_PROGRESS', message: 'Starting OAuth flow...' });
          const deviceCodeResponse = await GitHubOAuth.startDeviceFlow();
          sendToUI({
            type: 'OAUTH_DEVICE_CODE',
            userCode: deviceCodeResponse.user_code,
            verificationUri: deviceCodeResponse.verification_uri,
            interval: deviceCodeResponse.interval,
            deviceCode: deviceCodeResponse.device_code,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to start OAuth flow';
          sendToUI({
            type: 'OAUTH_ERROR',
            message: errorMessage,
          });
        }
        break;
      }

      case 'POLL_OAUTH_TOKEN': {
        // Poll for OAuth token
        try {
          const token = await GitHubOAuth.pollForToken(msg.deviceCode, msg.interval);
          sendToUI({
            type: 'OAUTH_SUCCESS',
            token,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'OAuth authentication failed';
          sendToUI({
            type: 'OAUTH_ERROR',
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

// Test GitHub connection with comprehensive validation including OAuth support
async function testGitHubConnection(
  config: GitHubConfig
): Promise<{ success: boolean; message: string }> {
  try {
    // Ensure we have either token or oauthToken
    if (!config.token && !config.oauthToken) {
      return {
        success: false,
        message: 'No authentication token provided. Please authenticate with GitHub first.',
      };
    }

    // Ensure we have repository info
    if (!config.owner || !config.repo) {
      return {
        success: false,
        message: 'Repository owner and name are required.',
      };
    }

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

    // Step 3: Detect multi-brand structure
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Analyzing token structure...' });

    const brandStructure = detectMultiBrandStructure(
      tokenFiles.map(path => ({ path })),
      config.brandFolderPattern
    );
    const isMultiBrandRepo = isMultiBrand(brandStructure);

    console.log(`🏢 Multi-brand structure detected: ${isMultiBrandRepo}`);
    if (isMultiBrandRepo) {
      console.log(`🏷️ Brands found: ${getBrandNames(brandStructure).join(', ')}`);
    }

    // Step 4: Parse and categorize token files
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Parsing token files...' });

    const processedFiles = categorizeTokenFiles(fileContents, brandStructure);

    if (processedFiles.length === 0) {
      return {
        success: false,
        message: 'No valid token files found to process',
      };
    }

    // Step 5: Transform tokens based on structure type
    sendToUI({ type: 'SYNC_PROGRESS', message: 'Creating Figma variables...' });

    let totalCollections = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    try {
      // Determine processing strategy based on configuration
      const useMultiBrandProcessing = isMultiBrandRepo && config.modeStrategy !== 'target';

      if (useMultiBrandProcessing) {
        // Multi-brand processing with automatic mode creation from brand names
        sendToUI({ type: 'SYNC_PROGRESS', message: 'Processing multi-brand tokens with automatic mode creation...' });

        const transformOptions = {
          collectionName: config.targetCollection || undefined,
          // For multi-brand auto mode, we don't use targetMode - modes are created from brand names
        };

        console.log(`🎯 Multi-brand transform options:`, transformOptions);
        console.log(`🎨 Mode strategy: auto (create modes from brand names)`);

        const result = await transformMultiBrandTokensToFigma(processedFiles, brandStructure, transformOptions);

        totalCollections += result.collectionsCreated;
        totalCreated += result.variablesCreated;
        totalUpdated += result.variablesUpdated;
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);

        if (!result.success) {
          console.error('Failed to transform multi-brand tokens:', result.errors);
        }
      } else {
        // Single-brand/traditional processing OR multi-brand with target mode strategy
        const processingMessage = isMultiBrandRepo
          ? 'Processing multi-brand tokens with target mode strategy...'
          : 'Processing single-brand tokens...';

        sendToUI({ type: 'SYNC_PROGRESS', message: processingMessage });

        // Merge all tokens as before
        const allTokens: any = {};
        for (const file of processedFiles) {
          Object.assign(allTokens, file.tokens);
          console.log(`📦 Merged tokens from ${file.path}`);
        }

        // Resolve all references globally
        const resolvedGlobalTokens = resolveTokenReferences(allTokens);
        console.log(`🔗 Resolved ${Object.keys(allTokens).length} top-level token groups`);

        // Transform all resolved tokens at once
        const transformOptions = {
          collectionName: config.targetCollection || undefined,
          targetMode: config.targetMode || undefined
        };

        if (isMultiBrandRepo) {
          console.log(`🎯 Multi-brand target mode transform options:`, transformOptions);
          console.log(`🎨 Mode strategy: target (use specified target mode instead of brand modes)`);
        } else {
          console.log(`🎯 Single-brand transform options:`, transformOptions);
        }

        const result = await transformTokensToFigma(resolvedGlobalTokens, transformOptions);

        totalCollections += result.collectionsCreated;
        totalCreated += result.variablesCreated;
        totalUpdated += result.variablesUpdated;
        allErrors.push(...result.errors);
        allWarnings.push(...result.warnings);

        if (!result.success) {
          console.error('Failed to transform tokens:', result.errors);
        }
      }
    } catch (error) {
      const errorMsg = `Failed to process tokens: ${error instanceof Error ? error.message : 'Unknown error'}`;
      allErrors.push(errorMsg);
      console.error(errorMsg);
    }

    // Step 6: Report results
    if (allErrors.length > 0) {
      return {
        success: false,
        message: `Sync completed with errors:\n${allErrors.slice(0, 5).join('\n')}${allErrors.length > 5 ? `\n... and ${allErrors.length - 5} more errors` : ''}`,
      };
    }

    const summary = [
      `✓ Successfully imported ${fileContents.length} token file(s)`,
      isMultiBrandRepo ? `✓ Multi-brand structure with ${getBrandNames(brandStructure).length} brands: ${getBrandNames(brandStructure).join(', ')}` : `✓ Single-brand structure`,
      `✓ Collections: ${totalCollections} created`,
      `✓ Variables: ${totalCreated} created, ${totalUpdated} updated`,
    ];

    if (isMultiBrandRepo) {
      summary.push(`✓ Modes created: Default + ${getBrandNames(brandStructure).join(', ')}`);
    }

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
