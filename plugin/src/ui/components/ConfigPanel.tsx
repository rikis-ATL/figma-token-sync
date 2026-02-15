import React, { useState, useEffect } from 'react';
import { PluginSettings, GitHubConfig } from '../../shared/types';
import GitHubAuth from './GitHubAuth';

interface ConfigPanelProps {
  settings: PluginSettings;
  onSave: (settings: PluginSettings) => void;
  onTest: (config: GitHubConfig) => void;
  isLoading: boolean;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ settings, onSave, onTest, isLoading }) => {
  const [authMethod, setAuthMethod] = useState<'token' | 'oauth'>('token');
  const [token, setToken] = useState('');
  const [oauthToken, setOauthToken] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [tokenPaths, setTokenPaths] = useState('tokens/**/*.json');
  const [targetCollection, setTargetCollection] = useState('Allied Telesis');
  const [targetMode, setTargetMode] = useState('');
  const [modeStrategy, setModeStrategy] = useState<'auto' | 'target'>('auto');
  const [availableModes, setAvailableModes] = useState<Array<{modeId: string, name: string}>>([]);
  const [isLoadingModes, setIsLoadingModes] = useState(false);

  useEffect(() => {
    if (settings.github) {
      setToken(settings.github.token || '');
      setOauthToken(settings.github.oauthToken || '');
      setRepoUrl(settings.github.repoUrl || '');
      setOwner(settings.github.owner || '');
      setRepo(settings.github.repo || '');
      setBranch(settings.github.branch || 'main');
      setTokenPaths(settings.github.tokenPaths?.join(', ') || 'tokens/**/*.json');
      setTargetCollection(settings.github.targetCollection || 'Allied Telesis');
      setTargetMode(settings.github.targetMode || '');
      setModeStrategy(settings.github.modeStrategy || 'auto');

      // Determine auth method based on what's available
      if (settings.github.oauthToken) {
        setAuthMethod('oauth');
      } else if (settings.github.token) {
        setAuthMethod('token');
      }
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

  const parseRepoUrl = (url: string) => {
    if (!url || typeof url !== 'string') {
      console.warn('⚠️  Invalid URL provided to parseRepoUrl:', url);
      return { owner: '', repo: '' };
    }

    const match = url.match(/github\.com[\/:]([^\/ ]+)\/([^\/ ]+)/);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
    return { owner: '', repo: '' };
  };

  const handleRepoUrlChange = (url: string) => {
    setRepoUrl(url);
    if (url) {
      const { owner: parsedOwner, repo: parsedRepo } = parseRepoUrl(url);
      setOwner(parsedOwner);
      setRepo(parsedRepo);
    }
  };

  const handleSave = () => {
    const config: GitHubConfig = {
      ...(authMethod === 'oauth' ? { oauthToken } : { token }),
      repoUrl: repoUrl || undefined,
      owner: owner || undefined,
      repo: repo || undefined,
      branch,
      tokenPaths: tokenPaths.split(',').map((p) => p.trim()).filter(Boolean),
      targetCollection: targetCollection.trim() || undefined,
      targetMode: targetMode.trim() || undefined,
      modeStrategy,
    };

    onSave({
      ...settings,
      github: config,
    });
  };

  const handleTest = () => {
    alert('BUTTON CLICKED!');
    console.log('🔘 Test button clicked!');
    console.log('🔘 Current state:', {
      authMethod,
      token: token ? `${token.substring(0, 8)}...` : 'empty',
      oauthToken: oauthToken ? `${oauthToken.substring(0, 8)}...` : 'empty',
      repoUrl,
      owner,
      repo,
      branch,
      tokenPaths,
      isLoading
    });

    const config: GitHubConfig = {
      ...(authMethod === 'oauth' ? { oauthToken } : { token }),
      repoUrl: repoUrl || undefined,
      owner: owner || undefined,
      repo: repo || undefined,
      branch,
      tokenPaths: tokenPaths.split(',').map((p) => p.trim()).filter(Boolean),
      targetCollection: targetCollection.trim() || undefined,
      targetMode: targetMode.trim() || undefined,
      modeStrategy,
    };
    console.log('🔘 Test config created:', config);
    console.log('🔘 Config valid?', isConfigValid);
    console.log('🔘 Button disabled?', !isConfigValid || isLoading);
    console.log('🔘 About to call onTest...');
    onTest(config);
    console.log('🔘 onTest called');
  };

  const hasAuth = authMethod === 'oauth' ? !!oauthToken : !!token;
  const hasRepo = !!(owner && repo);
  const hasBranch = !!branch;
  const hasTokenPaths = !!tokenPaths;

  const isConfigValid = hasAuth && hasRepo && hasBranch && hasTokenPaths;

  console.log('🔍 Validation check:', {
    authMethod,
    hasAuth,
    hasRepo: { owner, repo, hasRepo },
    hasBranch: { branch, hasBranch },
    hasTokenPaths: { tokenPaths, hasTokenPaths },
    isConfigValid,
    isLoading
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>GitHub Configuration</h3>

      {/* Authentication Method Toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 500 }}>Authentication Method</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
            <input
              type="radio"
              checked={authMethod === 'oauth'}
              onChange={() => setAuthMethod('oauth')}
            />
            OAuth (Recommended)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
            <input
              type="radio"
              checked={authMethod === 'token'}
              onChange={() => setAuthMethod('token')}
            />
            Personal Access Token
          </label>
        </div>
      </div>

      {/* Authentication Section */}
      {authMethod === 'oauth' ? (
        oauthToken ? (
          <div style={{ padding: '8px', background: 'var(--figma-color-bg-success)', borderRadius: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--figma-color-text-success)' }}>✓ Authenticated with GitHub</span>
            <button
              onClick={() => setOauthToken('')}
              style={{
                marginLeft: '8px',
                padding: '2px 6px',
                fontSize: '10px',
                border: 'none',
                background: 'transparent',
                color: 'var(--figma-color-text-success)',
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          </div>
        ) : (
          <GitHubAuth
            onTokenReceived={setOauthToken}
            isLoading={isLoading}
          />
        )
      ) : (
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
            Requires 'repo' scope. <a href="https://github.com/settings/tokens" target="_blank" style={{ color: 'var(--figma-color-text-brand)' }}>Generate token</a>
          </span>
        </div>
      )}

      {/* Repository Configuration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ fontSize: '11px', fontWeight: 500 }}>Repository URL</label>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => handleRepoUrlChange(e.target.value)}
          placeholder="https://github.com/owner/repo or owner/repo"
          style={inputStyle}
        />
        <span style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)' }}>
          GitHub repository URL or owner/repo format
        </span>
      </div>

      {/* Auto-filled Owner/Repo (read-only display) */}
      {(owner || repo) && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--figma-color-text-secondary)' }}>Owner</label>
            <input
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="owner"
              style={{ ...inputStyle, background: 'var(--figma-color-bg-secondary)' }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--figma-color-text-secondary)' }}>Repository</label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="repo"
              style={{ ...inputStyle, background: 'var(--figma-color-bg-secondary)' }}
            />
          </div>
        </div>
      )}

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
        <label style={{ fontSize: '11px', fontWeight: 500 }}>Mode Handling Strategy</label>
        <select
          value={modeStrategy}
          onChange={(e) => setModeStrategy(e.target.value as 'auto' | 'target')}
          style={inputStyle}
        >
          <option value="auto">Auto (create modes from brands)</option>
          <option value="target">Target Mode (use specified mode)</option>
        </select>
        <span style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)' }}>
          Auto: Creates modes from brand folders. Target: Uses the specific mode below.
        </span>
      </div>

      {modeStrategy === 'target' && (
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
          {' '}Note: Only applies when using Target Mode strategy.
        </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
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
        <button
          onClick={() => {
            if (confirm('Clear all configuration and settings? This cannot be undone.')) {
              setToken('');
              setOauthToken('');
              setRepoUrl('');
              setOwner('');
              setRepo('');
              setBranch('main');
              setTokenPaths('tokens/**/*.json');
              setTargetCollection('');
              setTargetMode('');
              setModeStrategy('auto');
              onSave({ github: undefined });
            }
          }}
          style={{ ...buttonStyle, background: 'var(--figma-color-bg-danger)', color: 'white' }}
        >
          Clear Config
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
