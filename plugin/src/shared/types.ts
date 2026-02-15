// Plugin Settings
export interface GitHubConfig {
  // Authentication - either token or OAuth
  token?: string; // Personal Access Token
  oauthToken?: string; // OAuth token from device flow

  // Repository info - can be URL or owner/repo
  repoUrl?: string; // e.g., "https://github.com/rikisommers/design-tokens" or "rikisommers/design-tokens"
  owner?: string; // Auto-extracted from repoUrl if not provided
  repo?: string; // Auto-extracted from repoUrl if not provided

  branch: string;
  tokenPaths: string[];
  targetCollection?: string; // Collection to import tokens into
  targetMode?: string; // Mode to place tokens in
}

export interface LastSync {
  timestamp: number;
  direction: 'pull' | 'push';
  status: 'success' | 'error';
  message?: string;
}

export interface FileStructureMapping {
  [variablePath: string]: string; // Maps "collection/variable/path" to original file path
}

export interface PluginSettings {
  github?: GitHubConfig;
  lastSync?: LastSync;
  fileStructure?: FileStructureMapping; // Store mapping for push operations
  modeMapping?: { [figmaModeName: string]: string }; // Maps Figma mode names to repository brand names
}

// Message types for Plugin <-> UI communication
export type PluginMessage =
  | { type: 'INIT' }
  | { type: 'SAVE_SETTINGS'; settings: PluginSettings }
  | { type: 'TEST_CONNECTION'; config: GitHubConfig }
  | { type: 'START_OAUTH_FLOW' }
  | { type: 'POLL_OAUTH_TOKEN'; deviceCode: string; interval: number }
  | { type: 'PULL_FROM_GITHUB'; config: GitHubConfig }
  | { type: 'PUSH_TO_GITHUB'; config: GitHubConfig }
  | { type: 'GET_COLLECTION_MODES'; collectionName: string }
  | { type: 'DIAGNOSTICS_MAPPING' };

export type UIMessage =
  | { type: 'SETTINGS_LOADED'; settings: PluginSettings }
  | { type: 'SETTINGS_SAVED'; success: boolean }
  | { type: 'CONNECTION_TESTED'; success: boolean; message: string }
  | { type: 'OAUTH_DEVICE_CODE'; userCode: string; verificationUri: string; interval: number; deviceCode: string }
  | { type: 'OAUTH_SUCCESS'; token: string }
  | { type: 'OAUTH_ERROR'; message: string }
  | { type: 'SYNC_STARTED'; direction: 'pull' | 'push' }
  | { type: 'SYNC_PROGRESS'; message: string }
  | { type: 'SYNC_COMPLETE'; success: boolean; message: string; prUrl?: string }
  | { type: 'ERROR'; message: string }
  | { type: 'COLLECTION_MODES'; modes: Array<{modeId: string, name: string}> }
  | { type: 'DIAGNOSTICS_RESULT'; mapping: FileStructureMapping | null; collections: string[]; variables: Array<{name: string, collection: string}> };

// Style Dictionary types
export interface StyleDictionaryToken {
  value: string | number | boolean;
  type?: string;
  comment?: string;
  [key: string]: any;
}

export interface StyleDictionaryTokens {
  [key: string]: StyleDictionaryToken | StyleDictionaryTokens;
}

// Multi-brand support types
export interface BrandInfo {
  name: string;
  path: string;
  files: string[];
}

export interface MultiBrandStructure {
  brands: BrandInfo[];
  globalFiles: string[];
  baseFiles: string[];
}

export interface ProcessedTokenFile {
  path: string;
  content: string;
  tokens: StyleDictionaryTokens;
  brand?: string;
  category: 'base' | 'global' | 'brand';
}
