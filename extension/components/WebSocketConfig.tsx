import React, { useState, useEffect } from 'react';
import type { WebSocketConfig as WSConfig } from '../functions/websocket';
import { toast } from 'react-toastify';

interface WebSocketConfigProps {
  initialConfig?: Partial<WSConfig>;
  onSave?: (config: Partial<WSConfig>) => Promise<void>;
  onTest?: (config: Partial<WSConfig>) => Promise<{ connected: boolean }>;
}

/**
 * Component for configuring WebSocket settings.
 */
const WebSocketConfig: React.FC<WebSocketConfigProps> = ({
  initialConfig = {},
  onSave,
  onTest
}) => {
  const [serverUrl, setServerUrl] = useState(initialConfig.serverUrl || 'ws://localhost:3000');
  const [namespace, setNamespace] = useState(initialConfig.namespace || '');
  const [reconnectInterval, setReconnectInterval] = useState(initialConfig.reconnectInterval || 2000);
  const [maxReconnectAttempts, setMaxReconnectAttempts] = useState(initialConfig.maxReconnectAttempts || 5);
  const [authToken, setAuthToken] = useState(initialConfig.authToken || '');
  const [debug, setDebug] = useState(initialConfig.debug || false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // Update form when initialConfig changes
  useEffect(() => {
    setServerUrl(initialConfig.serverUrl || 'ws://localhost:3000');
    setNamespace(initialConfig.namespace || '');
    setReconnectInterval(initialConfig.reconnectInterval || 2000);
    setMaxReconnectAttempts(initialConfig.maxReconnectAttempts || 5);
    setAuthToken(initialConfig.authToken || '');
    setDebug(initialConfig.debug || false);
  }, [initialConfig]);
  
  const handleSave = async () => {
    if (!serverUrl) {
      toast.error('Server URL is required');
      return;
    }
    
    const config: Partial<WSConfig> = {
      serverUrl,
      namespace: namespace || undefined,
      reconnectInterval,
      maxReconnectAttempts,
      authToken: authToken || undefined,
      debug
    };
    
    setIsSaving(true);
    
    try {
      if (onSave) {
        await onSave(config);
        toast.success('WebSocket configuration saved');
      }
    } catch (error) {
      toast.error(`Failed to save configuration: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleTest = async () => {
    if (!serverUrl) {
      toast.error('Server URL is required');
      return;
    }
    
    const config: Partial<WSConfig> = {
      serverUrl,
      namespace: namespace || undefined,
      reconnectInterval,
      maxReconnectAttempts,
      authToken: authToken || undefined,
      debug
    };
    
    setIsTesting(true);
    
    try {
      if (onTest) {
        const result = await onTest(config);
        if (result.connected) {
          toast.success('Successfully connected to WebSocket server');
        } else {
          toast.error('Failed to connect to WebSocket server');
        }
      }
    } catch (error) {
      toast.error(`Connection test failed: ${error.message}`);
    } finally {
      setIsTesting(false);
    }
  };
  
  return (
    <div className="websocket-config">
      <h3>WebSocket Configuration</h3>
      
      <div className="form-group">
        <label htmlFor="serverUrl">Server URL</label>
        <input
          type="text"
          id="serverUrl"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="ws://localhost:3000"
          required
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="namespace">Namespace (Optional)</label>
        <input
          type="text"
          id="namespace"
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          placeholder="namespace"
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="reconnectInterval">Reconnect Interval (ms)</label>
        <input
          type="number"
          id="reconnectInterval"
          value={reconnectInterval}
          onChange={(e) => setReconnectInterval(parseInt(e.target.value, 10))}
          min="100"
          max="30000"
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="maxReconnectAttempts">Max Reconnect Attempts</label>
        <input
          type="number"
          id="maxReconnectAttempts"
          value={maxReconnectAttempts}
          onChange={(e) => setMaxReconnectAttempts(parseInt(e.target.value, 10))}
          min="1"
          max="100"
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="authToken">Authentication Token (Optional)</label>
        <input
          type="password"
          id="authToken"
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
          placeholder="Leave blank if not required"
        />
      </div>
      
      <div className="form-group checkbox">
        <input
          type="checkbox"
          id="debug"
          checked={debug}
          onChange={(e) => setDebug(e.target.checked)}
        />
        <label htmlFor="debug">Enable Debug Logging</label>
      </div>
      
      <div className="form-actions">
        <button
          onClick={handleTest}
          disabled={isTesting || isSaving}
          className="test-button"
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>
        
        <button
          onClick={handleSave}
          disabled={isTesting || isSaving}
          className="save-button"
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
      
      <style>
        {`
         .websocket-config {
           padding: 1rem;
           background-color: #f9f9f9;
           border-radius: 4px;
           border: 1px solid #ddd;
         }
         
         h3 {
           margin-top: 0;
           margin-bottom: 1rem;
         }
         
         .form-group {
           margin-bottom: 1rem;
         }
         
         .form-group label {
           display: block;
           margin-bottom: 0.5rem;
           font-weight: 500;
         }
         
         .form-group input[type="text"],
         .form-group input[type="password"],
         .form-group input[type="number"] {
           width: 100%;
           padding: 0.5rem;
           border: 1px solid #ccc;
           border-radius: 4px;
         }
         
         .form-group.checkbox {
           display: flex;
           align-items: center;
         }
         
         .form-group.checkbox input {
           margin-right: 0.5rem;
         }
         
         .form-group.checkbox label {
           margin-bottom: 0;
         }
         
         .form-actions {
           display: flex;
           justify-content: flex-end;
           gap: 1rem;
           margin-top: 1.5rem;
         }
         
         button {
           padding: 0.5rem 1rem;
           border: none;
           border-radius: 4px;
           cursor: pointer;
           font-weight: 500;
         }
         
         button:disabled {
           opacity: 0.7;
           cursor: not-allowed;
         }
         
         .test-button {
           background-color: #f0f0f0;
           color: #333;
         }
         
         .save-button {
           background-color: #4caf50;
           color: white;
         }
        `}
      </style>
    </div>
  );
};

export default WebSocketConfig; 