import { Request, Response } from 'express';
import TeacherSession from '@/models/teacherSession';
import CourseClass from '@/models/courseClass';
import SectionModel from '@/models/section';
import Subject from '@/models/subject';
import { logger } from '@/lib/manualLogger';
import { launchPuppeteer } from '@/lib/puppeteer';
import * as XLSX from 'xlsx';

// Export individual teacher session (PDF or Excel based on type parameter)
export const exportIndividualSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { startDate, endDate, type = 'pdf' } = req.query;
    
    // Validate type parameter
    if (type !== 'pdf' && type !== 'excel') {
      res.status(400).json({
        success: false,
        message: 'Invalid type parameter. Must be "pdf" or "excel"'
      });
      return;
    }
    
    let session;
    
    if (id) {
      // Export specific session by ID
      session = await TeacherSession.findById(id)
        .populate('courseClassName', 'name')
        .populate('sectionName', 'name')
        .populate('subjectName', 'name')
        .lean();
      if (!session) {
        res.status(404).json({
          success: false,
          message: 'Teacher session not found'
        });
        return;
      }
    } else {
      // Export latest session for a teacher
      const { username } = req.query;
      if (!username) {
        res.status(400).json({
          success: false,
          message: 'Username is required when sessionId is not provided'
        });
        return;
      }
      
      const filter: any = { username };
      if (startDate || endDate) {
        filter.loginTime = {};
        if (startDate) filter.loginTime.$gte = new Date(startDate as string);
        if (endDate) filter.loginTime.$lte = new Date(endDate as string);
      }
      
      session = await TeacherSession.findOne(filter)
        .populate('courseClassName', 'name')
        .populate('sectionName', 'name')
        .populate('subjectName', 'name')
        .sort({ loginTime: -1 })
        .lean();
        
      if (!session) {
        res.status(404).json({
          success: false,
          message: 'No teacher session found for the given criteria'
        });
        return;
      }
    }
    
    // Calculate session duration as logout time - login time
    const logoutTime = session.logoutTime || (session as any).logoutAt;
    const sessionDuration = logoutTime
      ? new Date(logoutTime).getTime() - new Date(session.loginTime).getTime()
      : 0; // If no logout time, duration is 0 (session still active)
    
    // Calculate active and idle time - use session values first, fallback to fileAccessLog totals
    const totalActiveTime = session.activeTime || (session.fileAccessLog || []).reduce((sum: number, f: any) => sum + (f.activeTime || 0), 0);
    const totalIdleTime = session.idleTime || (session.fileAccessLog || []).reduce((sum: number, f: any) => sum + (f.idleTime || 0), 0);
    const totalEvents = session.section.reduce((sum, section) => sum + section.events.length, 0);
    const totalFileAccess = session.fileAccessLog.length;

    // Resolve display names from populated data
    const courseClassDisplay = session.courseClassName && typeof session.courseClassName === 'object' && 'name' in session.courseClassName ? (session.courseClassName as any).name : (String(session.courseClassName) || 'N/A');
    const sectionDisplay = session.sectionName && typeof session.sectionName === 'object' && 'name' in session.sectionName ? (session.sectionName as any).name : (String(session.sectionName) || 'N/A');
    const subjectDisplay = session.subjectName && typeof session.subjectName === 'object' && 'name' in session.subjectName ? (session.subjectName as any).name : (String(session.subjectName) || 'N/A');
  // Resolve section.id values to readable names when they look like ObjectIds
  const looksLikeObjectId = (val: any) => typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val);
  const sectionIdDisplayCache = new Map<string, string>();
  const resolveSectionIdDisplay = async (value: any): Promise<string> => {
    if (!value) return 'N/A';
    if (!looksLikeObjectId(value)) return String(value);
    if (sectionIdDisplayCache.has(value)) return sectionIdDisplayCache.get(value)!;
    const doc = await SectionModel.findById(value).lean();
    const display = doc?.name || String(value);
    sectionIdDisplayCache.set(value, display);
    return display;
  };
    
    if (type === 'pdf') {
      // Generate PDF using Puppeteer (robust launcher)
      const browser = await launchPuppeteer();
      
      const page = await browser.newPage();
      page.setDefaultTimeout(30000);
    
    // Create HTML content for PDF
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Teacher Session Report - ${session.username}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #007bff; padding-bottom: 20px; }
            .header h1 { color: #007bff; margin: 0; }
            .header h2 { color: #666; margin: 5px 0; }
            .section { margin: 20px 0; }
            .section h3 { color: #007bff; border-left: 4px solid #007bff; padding-left: 10px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 15px 0; }
            .info-item { background: #f8f9fa; padding: 15px; border-radius: 5px; }
            .info-label { font-weight: bold; color: #495057; }
            .info-value { margin-top: 5px; color: #212529; }
            .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
            .metric-card { background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center; }
            .metric-value { font-size: 24px; font-weight: bold; color: #1976d2; }
            .metric-label { font-size: 12px; color: #666; margin-top: 5px; }
            .section-details { margin: 15px 0; }
            .section-item { background: #f8f9fa; padding: 10px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #28a745; }
            .file-access { margin: 10px 0; }
            .file-item { background: #fff3cd; padding: 8px; margin: 5px 0; border-radius: 3px; font-size: 14px; }
            .events-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .events-table th, .events-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .events-table th { background-color: #f2f2f2; }
            .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Teacher Session Detailed Report</h1>
            <h2>${session.username} - ${courseClassDisplay}</h2>
            <p>Generated on: ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="section">
            <h3>Session Information</h3>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Teacher Name</div>
                    <div class="info-value">${session.username}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Course Class</div>
                    <div class="info-value">${courseClassDisplay}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Section</div>
                    <div class="info-value">${sectionDisplay}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Subject</div>
                    <div class="info-value">${subjectDisplay}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Login Time</div>
                    <div class="info-value">${new Date(session.loginTime).toLocaleString()}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Logout Time</div>
                    <div class="info-value">${logoutTime ? new Date(logoutTime).toLocaleString() : 'Session Active'}</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h3>Session Metrics</h3>
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value">${Math.round(sessionDuration / (1000 * 60))} min</div>
                    <div class="metric-label">Total Duration</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${Math.round(totalActiveTime / (1000 * 60))} min</div>
                    <div class="metric-label">Active Time</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${Math.round(totalIdleTime / (1000 * 60))} min</div>
                    <div class="metric-label">Idle Time</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${session.section.length}</div>
                    <div class="metric-label">Sections</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${totalEvents}</div>
                    <div class="metric-label">Total Events</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${totalFileAccess}</div>
                    <div class="metric-label">File Accesses</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h3>Session Sections</h3>
            <div class="section-details">
                ${await Promise.all(session.section.map(async (section, index) => {
                    const sectionIdDisplay = await resolveSectionIdDisplay(section.id);
                    return `
                    <div class="section-item">
                        <strong>Section ${index + 1}</strong> (${sectionIdDisplay})<br>
                        <strong>Start:</strong> ${section.startTime}<br>
                        <strong>End:</strong> ${section.endTime}<br>
                        <strong>Events:</strong> ${section.events.length}
                    </div>
                `;
                })).then(items => items.join(''))}
            </div>
        </div>
        
        <div class="section">
            <h3>File Access Log</h3>
            <div class="file-access">
                ${session.fileAccessLog.length > 0 ? 
                    session.fileAccessLog.map(file => `
                        <div class="file-item">
                            <strong>${file.fileName}</strong> 
                            ${file.folderName ? `(Folder: ${file.folderName})` : ''}
                            <br>Accessed: ${new Date(file.accessedAt).toLocaleString()}
                        </div>
                    `).join('') : 
                    '<p>No file access recorded</p>'
                }
            </div>
        </div>
        
        
        
        <div class="footer">
            <p>This report was generated automatically by the Sensei API system.</p>
        </div>
    </body>
    </html>
    `;
    
    await page.setContent(htmlContent, { waitUntil: 'load' });
    await page.emulateMediaType('screen');
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });
    
      await browser.close();
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="teacher-session-${session.username}-${new Date().toISOString().split('T')[0]}.pdf"`);
      res.send(pdfBuffer);
      
    } else if (type === 'excel') {
      const MAX_EXCEL_CELL_CHARS = 32767;
      const truncateForExcel = (value: any): any => {
        if (value === null || value === undefined) return '';
        if (typeof value !== 'string') return value;
        return value.length > MAX_EXCEL_CELL_CHARS - 10
          ? value.slice(0, MAX_EXCEL_CELL_CHARS - 10)
          : value;
      };
      const truncateRows = (rows: any[][]): any[][] =>
        rows.map(row => row.map(cell => (typeof cell === 'string' ? truncateForExcel(cell) : cell)));
      // Generate Excel using XLSX
      const workbook = XLSX.utils.book_new();
      
      // Session Summary Sheet
      const summaryData = [
        ['Teacher Session Detailed Report'],
        [''],
        ['Session Information'],
        ['Teacher Name', session.username],
        ['Course Class', courseClassDisplay],
        ['Section', sectionDisplay],
        ['Subject', subjectDisplay],
        ['Login Time', new Date(session.loginTime).toLocaleString()],
        ['Logout Time', logoutTime ? new Date(logoutTime).toLocaleString() : 'Session Active'],
        [''],
        ['Session Metrics'],
        ['Total Duration (minutes)', Math.round(sessionDuration / (1000 * 60))],
        ['Active Time (minutes)', Math.round(totalActiveTime / (1000 * 60))],
        ['Idle Time (minutes)', Math.round(totalIdleTime / (1000 * 60))],
        ['Number of Sections', session.section.length],
        ['Total Events', totalEvents],
        ['File Accesses', totalFileAccess]
      ];
      
      const summarySheet = XLSX.utils.aoa_to_sheet(truncateRows(summaryData));
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Session Summary');
      
      // Sections Sheet
      const sectionsData = [
        ['Section', 'Start Time', 'End Time', 'Number of Events']
      ];
      
      for (const section of session.section) {
        const sectionIdDisplay = await resolveSectionIdDisplay(section.id);
        sectionsData.push([
          sectionIdDisplay,
          section.startTime,
          section.endTime,
          section.events.length.toString()
        ]);
      }
      
      const sectionsSheet = XLSX.utils.aoa_to_sheet(truncateRows(sectionsData));
      XLSX.utils.book_append_sheet(workbook, sectionsSheet, 'Sections');
      
      // File Access Log Sheet
      const fileAccessData = [
        ['File Name', 'Folder Name', 'Accessed At']
      ];
      
      session.fileAccessLog.forEach(file => {
        fileAccessData.push([
          file.fileName,
          file.folderName || 'N/A',
          new Date(file.accessedAt).toLocaleString()
        ]);
      });
      
      const fileAccessSheet = XLSX.utils.aoa_to_sheet(truncateRows(fileAccessData));
      XLSX.utils.book_append_sheet(workbook, fileAccessSheet, 'File Access Log');
      
      // Events Sheet
      const eventsData = [
        ['Session Section', 'Section Index', 'Event Type', 'Timestamp', 'Data']
      ];
      
      for (let sectionIndex = 0; sectionIndex < session.section.length; sectionIndex++) {
        const section = session.section[sectionIndex];
        const sectionIdDisplay = await resolveSectionIdDisplay(section.id);
        section.events.forEach(event => {
          const dataString = JSON.stringify(event.data);
          eventsData.push([
            sectionIdDisplay,
            (sectionIndex + 1).toString(),
            event.type.toString(),
            new Date(event.timestamp).toLocaleString(),
            truncateForExcel(dataString)
          ]);
        });
      }
      
      const eventsSheet = XLSX.utils.aoa_to_sheet(truncateRows(eventsData));
      XLSX.utils.book_append_sheet(workbook, eventsSheet, 'Events');
      
      // Generate Excel buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="teacher-session-${session.username}-${new Date().toISOString().split('T')[0]}.xlsx"`);
      res.send(excelBuffer);
    }
    
  } catch (error) {
    await logger.logError('TEACHER_SESSION', 'EXPORT_INDIVIDUAL', error, req.userId || 'unknown', req);
    res.status(500).json({
      success: false,
      message: 'Failed to export individual session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

