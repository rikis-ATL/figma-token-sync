import React, { useState, useEffect } from 'react';
import { PluginSettings, GitHubConfig } from '../../shared/types';

interface ConfigPanelProps {
  settings: PluginSettings;
  onSave: (settings: PluginSettings) => void;
  onTest: (config: GitHubConfig) => void;
  isLoading: boolean;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ settings, onSave, onTest, isLoading }) => {
  const [token, setToken] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [tokenPaths, setTokenPaths] = useState('tokens/**/*.json');
  const [targetCollection, setTargetCollection] = useState('Allied Telesis');
  const [targetMode, setTargetMode] = useState('');
  const [availableModes, setAvailableModes] = useState<Array<{modeId: string, name: string}>>([]);
  const [isLoadingModes, setIsLoadingModes] = useState(false);

  useEffect(() => {
    if (settings.github) {
      setToken(settings.github.token || '');
      setOwner(settings.github.owner || '');
      setRepo(settings.github.repo || '');
      setBranch(settings.github.branch || 'main');
      setTokenPaths(settings.github.tokenPaths?.join(', ') || 'tokens/**/*.json');
      setTargetCollection(settings.github.targetCollection || 'Allied Telesis');
      setTargetMode(settings.github.targetMode || '');
    }
  }, [settings]);

  // Handle collection change and fetch modes
  const handleCollectionChange = (newCollection: string) => {
    setTargetCollection(newCollection);
    setTargetMode(''); // Reset mode when collection changes
    setAvailableModes([]);

    if (newCollection.trim()) {
      setIsLoadingModes(true);
      // Send message to plugin to get modes
      parent.postMessage({
        pluginMessage: {
          type: 'GET_COLLECTION_MODES',
          collectionName: newCollection.trim(),
        },
      }, '*');
    }
  };

  // Listen for collection modes response
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, modes } = event.data.pluginMessage || {};
      if (type === 'COLLECTION_MODES') {
        setAvailableModes(modes || []);
        setIsLoadingModes(false);

        // Auto-select first mode if available
        if (modes && modes.length > 0 && !targetMode) {
          setTargetMode(modes[0].name);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [targetMode]);

  // Load modes for initial collection
  useEffect(() => {
    if (targetCollection && availableModes.length === 0) {
      handleCollectionChange(targetCollection);
    }
  }, [targetCollection]);

  const handleSave = () => {
    const config: GitHubConfig = {
      token,
      owner,
      repo,
      branch,
      tokenPaths: tokenPaths.split(',').map((p) => p.trim()).filter(Boolean),
      targetCollection: targetCollection.trim() || undefined,
      targetMode: targetMode.trim() || undefined,
    };

    onSave({
      ...settings,
      github: config,
    });
  };

  const handleTest = () => {
    const config: GitHubConfig = {
      token,
      owner,
      repo,
      branch,
      tokenPaths: tokenPaths.split(',').map((p) => p.trim()).filter(Boolean),
      targetCollection: targetCollection.trim() || undefined,
      targetMode: targetMode.trim() || undefined,
    };
    onTest(config);
  };

  const isConfigValid = token && owner && repo && branch && tokenPaths;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>GitHub Configuration</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 500 }}>Personal Access Token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_xxxxxxxxxxxx"
          style={inputStyle}
        />
        <span style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)' }}>
          Requires 'repo' scope
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 500 }}>Owner</label>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="owner"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 500 }}>Repository</label>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="repo"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 500 }}>Branch</label>
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="main"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 500 }}>Token File Paths</label>
        <textarea
          value={tokenPaths}
          onChange={(e) => setTokenPaths(e.target.value)}
          placeholder="tokens/**/*.json&#10;or&#10;tokens/colors.json, tokens/spacing.json"
          rows={2}
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'monospace',
          }}
        />
        <span style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)' }}>
          Comma-separated paths or glob patterns (e.g., tokens/*.json)
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 500 }}>Target Collection</label>
        <input
          type="text"
          value={targetCollection}
          onChange={(e) => handleCollectionChange(e.target.value)}
          placeholder="Allied Telesis"
          style={inputStyle}
        />
        <span style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)' }}>
          Figma collection name to import tokens into
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 500 }}>
          Target Mode
          {isLoadingModes && <span style={{ marginLeft: '8px', fontSize: '10px' }}>Loading...</span>}
        </label>
        <select
          value={targetMode}
          onChange={(e) => setTargetMode(e.target.value)}
          disabled={availableModes.length === 0 || isLoadingModes}
          style={{
            ...inputStyle,
            cursor: availableModes.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          <option value="">Select mode...</option>
          {availableModes.map((mode) => (
            <option key={mode.modeId} value={mode.name}>
              {mode.name}
            </option>
          ))}
        </select>
        <span style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)' }}>
          {availableModes.length > 0
            ? `Found ${availableModes.length} mode(s) in collection`
            : targetCollection
              ? 'No modes found or collection doesn\'t exist'
              : 'Enter collection name to load modes'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button
          onClick={handleTest}
          disabled={!isConfigValid || isLoading}
          style={buttonStyle}
        >
          Test Connection
        </button>
        <button
          onClick={handleSave}
          disabled={!isConfigValid || isLoading}
          style={{ ...buttonStyle, background: 'var(--figma-color-bg-brand)' }}
        >
          Save
        </button>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '11px',
  border: '1px solid var(--figma-color-border)',
  borderRadius: '2px',
  background: 'var(--figma-color-bg)',
  color: 'var(--figma-color-text)',
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '11px',
  border: '1px solid var(--figma-color-border)',
  borderRadius: '2px',
  background: 'var(--figma-color-bg)',
  color: 'var(--figma-color-text)',
  cursor: 'pointer',
};

export default ConfigPanel;
