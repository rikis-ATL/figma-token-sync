import React, { useState, useEffect, useCallback } from 'react';
import { PluginSettings, UIMessage } from '../shared/types';
import { usePluginMessage } from './hooks/usePluginMessage';
import ConfigPanel from './components/ConfigPanel';
import SyncPanel from './components/SyncPanel';
import StatusPanel from './components/StatusPanel';

const App: React.FC = () => {
  const [settings, setSettings] = useState<PluginSettings>({});
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleMessage = useCallback((message: UIMessage) => {
    console.log('UI received message:', message.type);

    switch (message.type) {
      case 'SETTINGS_LOADED':
        setSettings(message.settings);
        setStatus('Settings loaded');
        break;

      case 'SETTINGS_SAVED':
        setStatus(message.success ? 'Settings saved successfully' : 'Failed to save settings');
        setIsLoading(false);
        break;

      case 'CONNECTION_TESTED':
        setStatus(message.message);
        setIsLoading(false);
        break;

      case 'SYNC_STARTED':
        setIsSyncing(true);
        setStatus(`Starting ${message.direction} sync...`);
        break;

      case 'SYNC_PROGRESS':
        setStatus(message.message);
        break;

      case 'SYNC_COMPLETE':
        setIsSyncing(false);
        if (message.success) {
          setStatus(message.prUrl ? `Success! PR: ${message.prUrl}` : message.message);
          // Update last sync
          const newSettings = {
            ...settings,
            lastSync: {
              timestamp: Date.now(),
              direction: 'pull' as const,
              status: 'success' as const,
              message: message.message,
            },
          };
          setSettings(newSettings);
        } else {
          setStatus(`Error: ${message.message}`);
        }
        break;

      case 'ERROR':
        setIsLoading(false);
        setIsSyncing(false);
        setStatus(`Error: ${message.message}`);
        break;
    }
  }, [settings]);

  const sendMessage = usePluginMessage(handleMessage);

  useEffect(() => {
    sendMessage({ type: 'INIT' });
  }, [sendMessage]);

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Figma Token Sync</h2>

      <ConfigPanel
        settings={settings}
        onSave={(newSettings) => {
          setIsLoading(true);
          setSettings(newSettings);
          sendMessage({ type: 'SAVE_SETTINGS', settings: newSettings });
        }}
        onTest={(config) => {
          setIsLoading(true);
          sendMessage({ type: 'TEST_CONNECTION', config });
        }}
        isLoading={isLoading}
      />

      <SyncPanel
        settings={settings}
        onPull={(config) => {
          sendMessage({ type: 'PULL_FROM_GITHUB', config });
        }}
        onPush={(config) => {
          sendMessage({ type: 'PUSH_TO_GITHUB', config });
        }}
        isSyncing={isSyncing}
      />

      <StatusPanel status={status} lastSync={settings.lastSync} />
    </div>
  );
};

export default App;
