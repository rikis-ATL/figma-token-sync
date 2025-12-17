import React from 'react';
import { LastSync } from '../../shared/types';

interface StatusPanelProps {
  status: string;
  lastSync?: LastSync;
}

const StatusPanel: React.FC<StatusPanelProps> = ({ status, lastSync }) => {
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Determine if status is success or error
  const isError = status.toLowerCase().includes('error') || status.toLowerCase().includes('failed');
  const isSuccess = status.includes('✓') || status.toLowerCase().includes('success');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>Status</h3>

      {status && (
        <div
          style={{
            padding: '8px',
            fontSize: '11px',
            background: isError
              ? 'var(--figma-color-bg-danger)'
              : isSuccess
              ? 'var(--figma-color-bg-success)'
              : 'var(--figma-color-bg-secondary)',
            color: isError
              ? 'var(--figma-color-text-ondanger)'
              : isSuccess
              ? 'var(--figma-color-text-onsuccess)'
              : 'var(--figma-color-text)',
            borderRadius: '2px',
            wordBreak: 'break-word',
            whiteSpace: 'pre-line',
            fontFamily: 'monospace',
          }}
        >
          {status}
        </div>
      )}

      {lastSync && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--figma-color-text-secondary)',
            padding: '8px',
            background: 'var(--figma-color-bg-secondary)',
            borderRadius: '2px',
          }}
        >
          <div style={{ marginBottom: '4px', fontWeight: 600 }}>Last Sync</div>
          <div>{formatTimestamp(lastSync.timestamp)}</div>
          <div>Direction: {lastSync.direction}</div>
          <div>
            Status:{' '}
            <span
              style={{
                color:
                  lastSync.status === 'success'
                    ? 'var(--figma-color-text-success)'
                    : 'var(--figma-color-text-danger)',
              }}
            >
              {lastSync.status}
            </span>
          </div>
          {lastSync.message && (
            <div style={{ marginTop: '4px', whiteSpace: 'pre-line' }}>
              {lastSync.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatusPanel;
