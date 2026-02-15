import { useEffect, useCallback } from 'react';
import { PluginMessage, UIMessage } from '../../shared/types';

export function usePluginMessage(handler: (message: UIMessage) => void) {
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      console.log('🎧 Message received from plugin:', event.data);
      const message = event.data.pluginMessage as UIMessage;
      if (message) {
        console.log('🎧 Processing plugin message:', message);
        handler(message);
      } else {
        console.log('🎧 No pluginMessage found in event data');
      }
    };

    console.log('🎧 Adding message listener');
    window.addEventListener('message', messageHandler);
    return () => {
      console.log('🎧 Removing message listener');
      window.removeEventListener('message', messageHandler);
    };
  }, [handler]);

  const sendMessage = useCallback((message: PluginMessage) => {
    console.log('🎯 usePluginMessage sendMessage called with:', message);
    console.log('🎯 parent object exists?', !!parent);
    console.log('🎯 parent.postMessage exists?', !!parent.postMessage);
    parent.postMessage({ pluginMessage: message }, '*');
    console.log('🎯 Message posted to parent');
  }, []);

  return sendMessage;
}
