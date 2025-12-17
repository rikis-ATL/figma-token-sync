import React from 'react';
import { PluginSettings, GitHubConfig } from '../../shared/types';

interface SyncPanelProps {
  settings: PluginSettings;
  onPull: (config: GitHubConfig) => void;
  onPush: (config: GitHubConfig) => void;
  isSyncing: boolean;
}

const SyncPanel: React.FC<SyncPanelProps> = ({ settings, onPull, onPush, isSyncing }) => {
  const isConfigured = settings.github?.token && settings.github?.owner && settings.github?.repo;

  const handlePull = () => {
    if (settings.github) {
      onPull(settings.github);
    }
  };

  const handlePush = () => {
    if (settings.github) {
      onPush(settings.github);
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
