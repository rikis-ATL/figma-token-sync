import React, { useState, useEffect } from 'react';

interface GitHubAuthProps {
  onTokenReceived: (token: string) => void;
  isLoading: boolean;
}

const GitHubAuth: React.FC<GitHubAuthProps> = ({ onTokenReceived, isLoading }) => {
  const [userCode, setUserCode] = useState<string>('');
  const [verificationUri, setVerificationUri] = useState<string>('');
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string>('');

  const startOAuth = () => {
    setError('');
    parent.postMessage({
      pluginMessage: {
        type: 'START_OAUTH_FLOW',
      },
    }, '*');
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, userCode: code, verificationUri: uri, deviceCode, interval, token, message } = event.data.pluginMessage || {};

      switch (type) {
        case 'OAUTH_DEVICE_CODE':
          setUserCode(code);
          setVerificationUri(uri);
          setIsPolling(true);

          // Start polling for token
          parent.postMessage({
            pluginMessage: {
              type: 'POLL_OAUTH_TOKEN',
              deviceCode,
              interval,
            },
          }, '*');
          break;

        case 'OAUTH_SUCCESS':
          setIsPolling(false);
          onTokenReceived(token);
          break;

        case 'OAUTH_ERROR':
          setIsPolling(false);
          setError(message);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onTokenReceived]);

  if (isPolling) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', border: '1px solid var(--figma-color-border)', borderRadius: '4px' }}>
        <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>GitHub Authentication</h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '11px' }}>
            1. Copy this code:
            <code style={{
              marginLeft: '8px',
              padding: '2px 6px',
              background: 'var(--figma-color-bg-secondary)',
              borderRadius: '2px',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: 600
            }}>
              {userCode}
            </code>
          </p>

          <p style={{ margin: 0, fontSize: '11px' }}>
            2. Open: <a href={verificationUri} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--figma-color-text-brand)' }}>
              {verificationUri}
            </a>
          </p>

          <p style={{ margin: 0, fontSize: '11px' }}>
            3. Paste the code and authorize the application
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            border: '2px solid var(--figma-color-border)',
            borderTop: '2px solid var(--figma-color-text-brand)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span style={{ fontSize: '11px', color: 'var(--figma-color-text-secondary)' }}>
            Waiting for authorization...
          </span>
        </div>

        {error && (
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--figma-color-text-danger)' }}>
            Error: {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button
        onClick={startOAuth}
        disabled={isLoading}
        style={{
          padding: '8px 16px',
          fontSize: '11px',
          border: '1px solid var(--figma-color-border)',
          borderRadius: '2px',
          background: 'var(--figma-color-bg-brand)',
          color: 'white',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.6 : 1,
        }}
      >
        {isLoading ? 'Authenticating...' : 'Authenticate with GitHub'}
      </button>

      {error && (
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--figma-color-text-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
};

export default GitHubAuth;