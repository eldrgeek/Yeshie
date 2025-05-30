import React, { useState, useEffect } from 'react';
import { Storage } from "@plasmohq/storage";
import { logInfo, logError } from "../functions/logger";

interface Report {
  id: string;
  type: 'bug' | 'feature';
  title: string;
  description: string;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed';
  buildInfo: {
    version: string;
    buildId: string;
  };
}

interface ReportsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ReportsPanel: React.FC<ReportsPanelProps> = ({ isOpen, onClose }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadReports();
    }
  }, [isOpen]);

  const loadReports = async () => {
    try {
      const storage = new Storage();
      const storedReports = await storage.get<Report[]>('reports') || [];
      logInfo("ReportsPanel", "Loaded reports", { storedReports });
      setReports(storedReports);
    } catch (error) {
      logError("ReportsPanel", "Error loading reports", { error });
      setToast('Error loading reports');
      setTimeout(() => setToast(null), 2000);
    }
  };

  const copyReportsToClipboard = async () => {
    logInfo("ReportsPanel", "User clicked 'Copy Pending Reports' button", { 
      reportCount: reports.filter(r => r.status === 'pending').length,
      action: "copy_reports_to_clipboard"
    });
    
    const pendingReports = reports.filter(r => r.status === 'pending');
    if (pendingReports.length === 0) {
      setToast('No pending reports to copy');
      setTimeout(() => setToast(null), 2000);
      return;
    }

    const reportText = pendingReports.map(report => {
      return `[${report.type.toUpperCase()}] ${report.title}\n${report.description}\n\n`;
    }).join('');

    const cursorPrompt = `Please review and process the following ${pendingReports.length} feature/bug reports:\n\n${reportText}`;

    try {
      await navigator.clipboard.writeText(cursorPrompt);
      setToast('Reports copied to clipboard');
      logInfo("ReportsPanel", "Successfully copied reports to clipboard", { 
        reportCount: pendingReports.length,
        textLength: cursorPrompt.length
      });
      setTimeout(() => setToast(null), 2000);
    } catch (error) {
      logError("ReportsPanel", "Error copying to clipboard", { error });
      setToast('Error copying to clipboard');
      setTimeout(() => setToast(null), 2000);
    }
  };

  const clearStoredReports = async () => {
    logInfo("ReportsPanel", "User clicked 'Clear All Reports' button", { 
      reportCount: reports.length,
      action: "clear_all_reports"
    });
    
    const storage = new Storage();
    await storage.set('reports', []);
    setReports([]);
    setToast('All reports cleared');
    logInfo("ReportsPanel", "Successfully cleared all reports", { 
      clearedCount: reports.length
    });
    setTimeout(() => setToast(null), 2000);
  };

  const handleClose = () => {
    logInfo("ReportsPanel", "User clicked close button", { 
      reportCount: reports.length,
      action: "close_reports_panel"
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2147483647
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '24px',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 'bold',
            margin: 0
          }}>Reports ({reports.length})</h2>
          <button
            onClick={handleClose}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              backgroundColor: '#f3f4f6',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '16px'
        }}>
          <button
            onClick={copyReportsToClipboard}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              backgroundColor: '#f3f4f6',
              cursor: 'pointer',
              flex: 1
            }}
          >
            Copy Pending Reports
          </button>
          <button
            onClick={clearStoredReports}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              backgroundColor: '#f3f4f6',
              cursor: 'pointer',
              flex: 1
            }}
          >
            Clear All Reports
          </button>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {reports.map(report => (
            <div
              key={report.id}
              style={{
                padding: '12px',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                backgroundColor: report.status === 'pending' ? '#f8fafc' : '#f3f4f6'
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '8px'
              }}>
                <div>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: report.type === 'bug' ? '#fee2e2' : '#e0f2fe',
                    color: report.type === 'bug' ? '#dc2626' : '#0284c7',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {report.type.toUpperCase()}
                  </span>
                  <span style={{
                    marginLeft: '8px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: report.status === 'pending' ? '#fef3c7' : '#dcfce7',
                    color: report.status === 'pending' ? '#d97706' : '#16a34a',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {report.status.toUpperCase()}
                  </span>
                </div>
                <span style={{
                  fontSize: '12px',
                  color: '#6b7280'
                }}>
                  {new Date(report.timestamp).toLocaleString()}
                </span>
              </div>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                margin: '0 0 8px 0'
              }}>
                {report.title}
              </h3>
              <p style={{
                fontSize: '14px',
                color: '#374151',
                margin: 0,
                whiteSpace: 'pre-wrap'
              }}>
                {report.description}
              </p>
            </div>
          ))}
        </div>

        {toast && (
          <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            zIndex: 2147483647
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPanel; 