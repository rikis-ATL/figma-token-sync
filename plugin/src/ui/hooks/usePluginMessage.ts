import { useEffect, useCallback } from 'react';
import { PluginMessage, UIMessage } from '../../shared/types';

export function usePluginMessage(handler: (message: UIMessage) => void) {
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data.pluginMessage as UIMessage;
      if (message) {
        handler(message);
      }
    };

    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, [handler]);

  const sendMessage = useCallback((message: PluginMessage) => {
    parent.postMessage({ pluginMessage: message }, '*');
  }, []);

  return sendMessage;
}
