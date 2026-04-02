/** CSS-in-JS styles for the Yeshie progress overlay (injected into shadow DOM) */
export const overlayStyles = `
  #yeshie-overlay {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    width: 320px;
    max-height: 400px;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    border-radius: 8px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    display: none;
  }
  #yeshie-overlay.visible {
    display: flex;
    flex-direction: column;
  }
  .yeshie-header {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    cursor: pointer;
    user-select: none;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .yeshie-logo {
    width: 22px;
    height: 22px;
    background: #6c5ce7;
    color: #fff;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 13px;
    margin-right: 8px;
    flex-shrink: 0;
  }
  .yeshie-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .yeshie-minimize {
    background: none;
    border: none;
    color: rgba(255,255,255,0.6);
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .yeshie-minimize:hover {
    color: #fff;
  }
  .yeshie-body {
    overflow: hidden;
    transition: max-height 0.2s ease;
  }
  .yeshie-body.minimized {
    max-height: 0 !important;
    overflow: hidden;
  }
  .yeshie-steps {
    padding: 8px 12px;
    overflow-y: auto;
    max-height: 260px;
  }
  .yeshie-step {
    padding: 4px 0;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .yeshie-step.pending {
    color: rgba(255,255,255,0.5);
  }
  .yeshie-step.running {
    color: #ffc107;
  }
  .yeshie-step.ok {
    color: #66bb6a;
    opacity: 0.8;
  }
  .yeshie-step.error {
    color: #ef5350;
  }
  .yeshie-step .detail {
    font-size: 12px;
    opacity: 0.7;
    margin-left: 6px;
  }
  .yeshie-controls {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid rgba(255,255,255,0.1);
  }
  .yeshie-suggest-btn, .yeshie-cancel-btn {
    flex: 1;
    padding: 6px 0;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .yeshie-suggest-btn {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }
  .yeshie-suggest-btn:hover {
    background: rgba(255,255,255,0.2);
  }
  .yeshie-cancel-btn {
    background: rgba(239,83,80,0.2);
    color: #ef5350;
  }
  .yeshie-cancel-btn:hover {
    background: rgba(239,83,80,0.35);
  }
  .yeshie-suggest-input {
    display: none;
    padding: 8px 12px;
    border-top: 1px solid rgba(255,255,255,0.1);
    gap: 6px;
  }
  .yeshie-suggest-input.active {
    display: flex;
  }
  .yeshie-suggest-input input {
    flex: 1;
    padding: 6px 8px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 4px;
    background: rgba(255,255,255,0.05);
    color: #fff;
    font-size: 13px;
    outline: none;
  }
  .yeshie-suggest-input input::placeholder {
    color: rgba(255,255,255,0.4);
  }
  .yeshie-suggest-input button {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    background: #6c5ce7;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
  }
  .yeshie-suggest-input button:hover {
    background: #7c6cf7;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
  .yeshie-step.running {
    animation: pulse 1.5s ease-in-out infinite;
  }
`;
