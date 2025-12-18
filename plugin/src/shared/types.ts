// Plugin Settings
export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
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

export interface PluginSettings {
  github?: GitHubConfig;
  lastSync?: LastSync;
}

// Message types for Plugin <-> UI communication
export type PluginMessage =
  | { type: 'INIT' }
  | { type: 'SAVE_SETTINGS'; settings: PluginSettings }
  | { type: 'TEST_CONNECTION'; config: GitHubConfig }
  | { type: 'PULL_FROM_GITHUB'; config: GitHubConfig }
  | { type: 'PUSH_TO_GITHUB'; config: GitHubConfig }
  | { type: 'GET_COLLECTION_MODES'; collectionName: string };

export type UIMessage =
  | { type: 'SETTINGS_LOADED'; settings: PluginSettings }
  | { type: 'SETTINGS_SAVED'; success: boolean }
  | { type: 'CONNECTION_TESTED'; success: boolean; message: string }
  | { type: 'SYNC_STARTED'; direction: 'pull' | 'push' }
  | { type: 'SYNC_PROGRESS'; message: string }
  | { type: 'SYNC_COMPLETE'; success: boolean; message: string; prUrl?: string }
  | { type: 'ERROR'; message: string }
  | { type: 'COLLECTION_MODES'; modes: Array<{modeId: string, name: string}> };

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
