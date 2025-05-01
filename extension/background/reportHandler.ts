import { Storage } from "@plasmohq/storage";

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

const storage = new Storage();

// Initialize reports storage if not exists
export async function initializeReports() {
  const reports = await storage.get<Report[]>('reports');
  if (!reports) {
    await storage.set('reports', []);
  }
}

// Add a new report
export async function addReport(report: Omit<Report, 'id' | 'timestamp' | 'status' | 'buildInfo'>) {
  const reports = await storage.get<Report[]>('reports') || [];
  const buildInfo = await getBuildInfo();
  
  const newReport: Report = {
    ...report,
    id: Math.random().toString(36).substring(7),
    timestamp: Date.now(),
    status: 'pending',
    buildInfo
  };
  
  reports.push(newReport);
  await storage.set('reports', reports);
  
  // Trigger processing
  processReports();
  
  return newReport;
}

// Get all reports
export async function getReports(): Promise<Report[]> {
  return await storage.get<Report[]>('reports') || [];
}

// Process pending reports
async function processReports() {
  const reports = await storage.get<Report[]>('reports') || [];
  const pendingReports = reports.filter(r => r.status === 'pending');
  
  for (const report of pendingReports) {
    try {
      // Update status to processing
      report.status = 'processing';
      await storage.set('reports', reports);
      
      // Here you would typically:
      // 1. Send the report to your backend
      // 2. Process with Cursor LLM
      // 3. Update status based on result
      
      // For now, we'll just mark it as completed
      report.status = 'completed';
      await storage.set('reports', reports);
      
    } catch (error) {
      console.error('Error processing report:', error);
      // Keep status as pending for retry
    }
  }
}

// Get build info from buildCounter
async function getBuildInfo() {
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