import React from 'react';
import { PluginSettings, GitHubConfig } from '../../shared/types';

// Simple validation function updated for OAuth support
const validateGitHubConfig = (config: GitHubConfig) => {
  const hasAuth = Boolean(config.token || config.oauthToken);
  const hasRepo = Boolean(config.owner && config.repo);
  const hasBranch = Boolean(config.branch);
  const hasTokenPaths = Boolean(config.tokenPaths?.length > 0);

  console.log('🔧 SyncPanel validation:', {
    hasAuth,
    hasRepo,
    hasBranch,
    hasTokenPaths,
    config: {
      token: config.token ? 'present' : 'missing',
      oauthToken: config.oauthToken ? 'present' : 'missing',
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      tokenPaths: config.tokenPaths
    }
  });

  return {
    valid: Boolean(config && hasAuth && hasRepo && hasBranch && hasTokenPaths)
  };
};

interface SyncPanelProps {
  settings: PluginSettings;
  onPull: (config: GitHubConfig) => void;
  onPush: (config: GitHubConfig) => void;
  isSyncing: boolean;
}

const SyncPanel: React.FC<SyncPanelProps> = ({ settings, onPull, onPush, isSyncing }) => {
  // Check if GitHub config is valid using the validation utility
  const isConfigured = settings.github ? validateGitHubConfig(settings.github).valid : false;

  const handlePull = () => {
    console.log('🔽 Pull button clicked');
    if (settings.github) {
      console.log('🔽 Calling onPull with config:', settings.github);
      onPull(settings.github);
    } else {
      console.log('🔽 No GitHub config available');
    }
  };

  const handlePush = () => {
    console.log('🔼 Push button clicked');
    if (settings.github) {
      console.log('🔼 Calling onPush with config:', settings.github);
      onPush(settings.github);
    } else {
      console.log('🔼 No GitHub config available');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>Sync</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button
            onClick={handlePull}
            disabled={!isConfigured || isSyncing}
            style={{
              ...buttonStyle,
              background: isConfigured ? 'var(--figma-color-bg-brand)' : 'var(--figma-color-bg)',
              opacity: !isConfigured || isSyncing ? 0.5 : 1,
            }}
          >
            Pull from GitHub → Figma
          </button>
          <span style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)' }}>
            Fetch latest tokens and update Figma variables
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button
            onClick={handlePush}
            disabled={!isConfigured || isSyncing}
            style={{
              ...buttonStyle,
              opacity: !isConfigured || isSyncing ? 0.5 : 1,
            }}
          >
            Push to GitHub ← Figma
          </button>
          <span style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)' }}>
            Export Figma variables and create Pull Request
          </span>
        </div>
      </div>

      {!isConfigured && (
        <div
          style={{
            padding: '8px',
            fontSize: '10px',
            background: 'var(--figma-color-bg-warning)',
            color: 'var(--figma-color-text-onwarning)',
            borderRadius: '2px',
          }}
        >
          Configure GitHub settings above to enable sync
        </div>
      )}
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '11px',
  fontWeight: 500,
  border: '1px solid var(--figma-color-border)',
  borderRadius: '2px',
  background: 'var(--figma-color-bg)',
  color: 'var(--figma-color-text)',
  cursor: 'pointer',
};

export default SyncPanel;
