import { storageGet, storageSet } from "../functions/storage";
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

// Initialize reports storage if not exists
export async function initializeReports() {
  try {
    const reports = await storageGet<Report[]>('reports');
    if (reports === undefined) {
      logInfo('ReportHandler', 'storage_init: reports, Initializing empty array', { key: 'reports', status: 'Initializing empty array' });
      await storageSet('reports', []);
    } else {
      logInfo('ReportHandler', 'storage_init: reports, Already exists', { key: 'reports', status: 'Already exists', count: reports.length });
    }
  } catch (error) {
    logError('ReportHandler', "Error initializing reports storage", { error });
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('ReportHandler', 'storage_error: initializeReports', { operation: 'initializeReports', error: errorMessage });
  }
}

// Add a new report
export async function addReport(report: Omit<Report, 'id' | 'timestamp' | 'status' | 'buildInfo'>) {
  try {
    const reports = await storageGet<Report[]>('reports') || [];
    const buildInfo = await getBuildInfoFromBackground();
    
    const newReport: Report = {
      ...report,
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      status: 'pending',
      buildInfo
    };
    
    reports.push(newReport);
    await storageSet('reports', reports);
    
    // Trigger processing
    processReports();
    
    return newReport;
  } catch (error) {
    logError('ReportHandler', "Error adding report", { error });
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('ReportHandler', 'storage_error: addReport', { operation: 'addReport', error: errorMessage });
    throw error;
  }
}

// Get all reports
export async function getReports(): Promise<Report[]> {
  try {
    const reports = await storageGet<Report[]>('reports') || [];
    logInfo('ReportHandler', 'storage_get: reports', { key: 'reports', count: reports.length });
    return reports;
  } catch (error) {
    logError('ReportHandler', "Error getting reports", { error });
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('ReportHandler', 'storage_error: getReports', { operation: 'getReports', error: errorMessage });
    return [];
  }
}

// Process pending reports
async function processReports() {
  let reports: Report[] = [];
  try {
    reports = await storageGet<Report[]>('reports') || [];
    const pendingReports = reports.filter(r => r.status === 'pending');
    logInfo('ReportHandler', 'report_processing', { totalReports: reports.length, pendingCount: pendingReports.length });

    let processed = false;
    for (const report of pendingReports) {
      try {
        // Update status to processing
        report.status = 'processing';
        processed = true;

        // Here you would typically:
        // 1. Send the report to your backend
        // 2. Process with Cursor LLM
        // 3. Update status based on result
        
        // For now, we'll just mark it as completed
        report.status = 'completed';
        processed = true;

        logInfo('ReportHandler', 'report_processed', { reportId: report.id, newStatus: report.status });

      } catch (error) {
        logError('ReportHandler', 'Error processing report', { reportId: report.id, error });
        const errorMessage = error instanceof Error ? error.message : String(error);
        logError('ReportHandler', 'report_processing_error', { reportId: report.id, error: errorMessage });
        // Keep status as pending for retry, don't mark as processed
      }
    }
    // Save reports back to storage only if changes were made
    if (processed) {
      logInfo('ReportHandler', 'storage_set: reports, Updating processed reports', { key: 'reports', reason: 'Updating processed reports' });
      await storageSet('reports', reports);
    }

  } catch (error) {
    logError('ReportHandler', 'Error fetching reports for processing', { error });
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('ReportHandler', 'storage_error: processReports_fetch', { operation: 'processReports_fetch', error: errorMessage });
  }
}

// Get build info from buildCounter
async function getBuildInfoFromBackground() {
  const { manifestVersion, buildId } = await import('./buildCounter').then(m => m.getBuildInfo());
  return {
    version: manifestVersion,
    buildId
  };
}

// Initialize on extension install/update
chrome.runtime.onInstalled.addListener(() => {
  initializeReports();
}); 