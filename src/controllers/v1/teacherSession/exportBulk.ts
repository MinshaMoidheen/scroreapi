import { Request, Response } from 'express';
import TeacherSession, { ITeacherSession } from '@/models/teacherSession';
import CourseClass from '@/models/courseClass';
import SectionModel from '@/models/section';
import Subject from '@/models/subject';
import { logger } from '@/lib/manualLogger';
import { launchPuppeteer } from '@/lib/puppeteer';
import * as XLSX from 'xlsx';

// Export bulk teacher sessions as PDF report
export const exportBulkSessionsPDF = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      username, 
      startDate, 
      endDate, 
      courseClass, 
      section, 
      subject,
      active 
    } = req.query;
    
    // Build filter
    const filter: any = {};
    if (username) filter.username = username;
    if (active !== undefined) filter.active = active === 'true';
    if (courseClass) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(courseClass as string);
      if (looksLikeObjectId) {
        filter.courseClassName = courseClass;
      } else {
        // Find by name and use the IDs
        const courseClasses = await CourseClass.find({ name: { $regex: courseClass as string, $options: 'i' } }).select('_id').lean();
        filter.courseClassName = { $in: courseClasses.map(cc => cc._id) };
      }
    }
    if (section) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(section as string);
      if (looksLikeObjectId) {
        filter.sectionName = section;
      } else {
        // Find by name and use the IDs
        const sections = await SectionModel.find({ name: { $regex: section as string, $options: 'i' } }).select('_id').lean();
        filter.sectionName = { $in: sections.map(s => s._id) };
      }
    }
    if (subject) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(subject as string);
      if (looksLikeObjectId) {
        filter.subjectName = subject;
      } else {
        // Find by name and use the IDs
        const subjects = await Subject.find({ name: { $regex: subject as string, $options: 'i' } }).select('_id').lean();
        filter.subjectName = { $in: subjects.map(s => s._id) };
      }
    }
    
    if (startDate || endDate) {
      filter.loginTime = {};
      if (startDate) filter.loginTime.$gte = new Date(startDate as string);
      if (endDate) filter.loginTime.$lte = new Date(endDate as string);
    }
    
    const sessions: ITeacherSession[] = await TeacherSession.find(filter)
      .populate('courseClassName', 'name')
      .populate('sectionName', 'name')
      .populate('subjectName', 'name')
      .sort({ loginTime: -1 })
      .lean();
    
    if (sessions.length === 0) {
      res.status(404).json({
        success: false,
        message: 'No teacher sessions found for the given criteria'
      });
      return;
    }
    
    type SessionWithDisplay = ITeacherSession & { courseClassDisplay: string; sectionDisplay: string; subjectDisplay: string };
    const sessionsWithDisplay: SessionWithDisplay[] = sessions.map((s: any) => ({
      ...s,
      courseClassDisplay: s.courseClassName && typeof s.courseClassName === 'object' && 'name' in s.courseClassName ? s.courseClassName.name : (String(s.courseClassName) || 'N/A'),
      sectionDisplay: s.sectionName && typeof s.sectionName === 'object' && 'name' in s.sectionName ? s.sectionName.name : (String(s.sectionName) || 'N/A'),
      subjectDisplay: s.subjectName && typeof s.subjectName === 'object' && 'name' in s.subjectName ? s.subjectName.name : (String(s.subjectName) || 'N/A'),
    }));

    // Compute per-session active/idle from fileAccessLog when available, fallback to session-level values
    type SessionComputed = SessionWithDisplay & { activeTimeComputed: number; idleTimeComputed: number };
    const sessionsComputed: SessionComputed[] = sessionsWithDisplay.map((s: any) => {
      // Calculate from fileAccessLog
      const activeTimeFromFiles = (s.fileAccessLog || []).reduce((acc: number, f: any) => acc + (Number(f.activeTime) || 0), 0);
      const idleTimeFromFiles = (s.fileAccessLog || []).reduce((acc: number, f: any) => acc + (Number(f.idleTime) || 0), 0);
      
      // Use session-level values if they exist and are defined, otherwise use fileAccessLog totals
      const activeTimeComputed = (s.activeTime !== undefined && s.activeTime !== null) 
        ? Number(s.activeTime) 
        : activeTimeFromFiles;
      const idleTimeComputed = (s.idleTime !== undefined && s.idleTime !== null) 
        ? Number(s.idleTime) 
        : idleTimeFromFiles;
      
      return {
        ...s,
        activeTimeComputed,
        idleTimeComputed
      };
    });

    // Calculate summary statistics using computed values
    const totalSessions = sessionsComputed.length;
    const totalActiveTime = sessionsComputed.reduce((sum, session) => sum + (session.activeTimeComputed || 0), 0);
    const totalIdleTime = sessionsComputed.reduce((sum, session) => sum + (session.idleTimeComputed || 0), 0);
    const totalEvents = sessionsComputed.reduce((sum, session) => 
      sum + session.section.reduce((sectionSum, section) => sectionSum + section.events.length, 0), 0);
    const totalFileAccess = sessionsComputed.reduce((sum, session) => sum + session.fileAccessLog.length, 0);

    // Build teacher stats using computed values
    const teacherStatsDisplay = sessionsComputed.reduce((acc, session) => {
      if (!acc[session.username]) {
        acc[session.username] = {
          sessions: 0,
          totalActiveTime: 0,
          totalIdleTime: 0,
          totalEvents: 0,
          totalFileAccess: 0,
          courseClasses: new Set<string>(),
          sections: new Set<string>(),
          subjects: new Set<string>()
        };
      }
      acc[session.username].sessions++;
      acc[session.username].totalActiveTime += session.activeTimeComputed || 0;
      acc[session.username].totalIdleTime += session.idleTimeComputed || 0;
      acc[session.username].totalEvents += session.section.reduce((sum: number, section: any) => sum + section.events.length, 0);
      acc[session.username].totalFileAccess += session.fileAccessLog.length;
      acc[session.username].courseClasses.add(session.courseClassDisplay);
      acc[session.username].sections.add(session.sectionDisplay);
      acc[session.username].subjects.add(session.subjectDisplay);
      return acc;
    }, {} as any);

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
        <title>Teacher Sessions Report</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #007bff; padding-bottom: 20px; }
            .header h1 { color: #007bff; margin: 0; }
            .header h2 { color: #666; margin: 5px 0; }
            .section { margin: 20px 0; }
            .section h3 { color: #007bff; border-left: 4px solid #007bff; padding-left: 10px; }
            .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
            .summary-card { background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center; }
            .summary-value { font-size: 24px; font-weight: bold; color: #1976d2; }
            .summary-label { font-size: 12px; color: #666; margin-top: 5px; }
            .teacher-grid { display: grid; grid-template-columns: 1fr; gap: 15px; margin: 20px 0; }
            .teacher-card { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; }
            .teacher-name { font-size: 18px; font-weight: bold; color: #007bff; margin-bottom: 10px; }
            .teacher-metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 10px 0; }
            .metric-item { text-align: center; }
            .metric-value { font-size: 16px; font-weight: bold; color: #495057; }
            .metric-label { font-size: 11px; color: #666; }
            .sessions-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .sessions-table th, .sessions-table td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            .sessions-table th { background-color: #f2f2f2; }
            .footer { margin-top: 40px; text-align: center; color: #666; font-size: 12px; }
            .page-break { page-break-before: always; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Teacher Sessions Report</h1>
            <h2>${startDate ? `From ${new Date(startDate as string).toLocaleDateString()}` : ''} 
                ${endDate ? `To ${new Date(endDate as string).toLocaleDateString()}` : ''}</h2>
            <p>Generated on: ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="section">
            <h3>Overall Summary</h3>
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="summary-value">${totalSessions}</div>
                    <div class="summary-label">Total Sessions</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${Math.round(totalActiveTime / (1000 * 60))}</div>
                    <div class="summary-label">Total Active Time (min)</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${Math.round(totalIdleTime / (1000 * 60))}</div>
                    <div class="summary-label">Total Idle Time (min)</div>
                </div>
                <div class="summary-card">
                    <div class="summary-value">${totalEvents}</div>
                    <div class="summary-label">Total Events</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h3>Teacher Performance Summary</h3>
            <div class="teacher-grid">
                ${Object.entries(teacherStatsDisplay).map(([teacherName, stats]: [string, any]) => `
                    <div class="teacher-card">
                        <div class="teacher-name">${teacherName}</div>
                        <div class="teacher-metrics">
                            <div class="metric-item">
                                <div class="metric-value">${stats.sessions}</div>
                                <div class="metric-label">Sessions</div>
                            </div>
                            <div class="metric-item">
                                <div class="metric-value">${Math.round(stats.totalActiveTime / (1000 * 60))}</div>
                                <div class="metric-label">Active Time (min)</div>
                            </div>
                            <div class="metric-item">
                                <div class="metric-value">${Math.round(stats.totalIdleTime / (1000 * 60))}</div>
                                <div class="metric-label">Idle Time (min)</div>
                            </div>
                            <div class="metric-item">
                                <div class="metric-value">${stats.totalEvents}</div>
                                <div class="metric-label">Events</div>
                            </div>
                            <div class="metric-item">
                                <div class="metric-value">${stats.totalFileAccess}</div>
                                <div class="metric-label">File Accesses</div>
                            </div>
                        </div>
                        <div style="margin-top: 10px; font-size: 12px; color: #666;">
                            <strong>Course Classes:</strong> ${Array.from(stats.courseClasses).join(', ')}<br>
                            <strong>Sections:</strong> ${Array.from(stats.sections).join(', ')}<br>
                            <strong>Subjects:</strong> ${Array.from(stats.subjects).join(', ')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="section page-break">
            <h3>Detailed Sessions List</h3>
            <table class="sessions-table">
                <thead>
                    <tr>
                        <th>Teacher</th>
                        <th>Course Class</th>
                        <th>Section</th>
                        <th>Subject</th>
                        <th>Login Time</th>
                        <th>Logout Time</th>
                        <th>Duration (min)</th>
                        <th>Active Time (min)</th>
                        <th>Idle Time (min)</th>
                        <th>Events</th>
                        <th>File Access</th>
                    </tr>
                </thead>
                <tbody>
                    ${sessionsComputed.map((session: SessionComputed) => {
                        const duration = session.logoutTime 
                          ? new Date(session.logoutTime).getTime() - new Date(session.loginTime).getTime()
                          : Date.now() - new Date(session.loginTime).getTime();
                        const totalEvents = session.section.reduce((sum: number, section: any) => sum + section.events.length, 0);
                        
                        return `
                            <tr>
                                <td>${session.username}</td>
                                <td>${session.courseClassDisplay}</td>
                                <td>${session.sectionDisplay}</td>
                                <td>${session.subjectDisplay}</td>
                                <td>${new Date(session.loginTime).toLocaleString()}</td>
                                <td>${session.logoutTime ? new Date(session.logoutTime).toLocaleString() : 'Active'}</td>
                                <td>${Math.round(duration / (1000 * 60))}</td>
                                <td>${Math.round((session.activeTimeComputed || 0) / (1000 * 60))}</td>
                                <td>${Math.round((session.idleTimeComputed || 0) / (1000 * 60))}</td>
                                <td>${totalEvents}</td>
                                <td>${session.fileAccessLog.length}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
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
    res.setHeader('Content-Disposition', `attachment; filename="teacher-sessions-report-${new Date().toISOString().split('T')[0]}.pdf"`);
    res.send(pdfBuffer);
    
  } catch (error) {
    await logger.logError('TEACHER_SESSION', 'EXPORT_BULK_PDF', error, req.userId || 'anonymous', req);
    res.status(500).json({
      success: false,
      message: 'Failed to export bulk sessions PDF',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Export bulk teacher sessions as Excel report
export const exportBulkSessionsExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      username, 
      startDate, 
      endDate, 
      courseClass, 
      section, 
      subject,
      active 
    } = req.query;
    
    // Build filter
    const filter: any = {};
    if (username) filter.username = username;
    if (active !== undefined) filter.active = active === 'true';
    if (courseClass) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(courseClass as string);
      if (looksLikeObjectId) {
        filter.courseClassName = courseClass;
      } else {
        // Find by name and use the IDs
        const courseClasses = await CourseClass.find({ name: { $regex: courseClass as string, $options: 'i' } }).select('_id').lean();
        filter.courseClassName = { $in: courseClasses.map(cc => cc._id) };
      }
    }
    if (section) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(section as string);
      if (looksLikeObjectId) {
        filter.sectionName = section;
      } else {
        // Find by name and use the IDs
        const sections = await SectionModel.find({ name: { $regex: section as string, $options: 'i' } }).select('_id').lean();
        filter.sectionName = { $in: sections.map(s => s._id) };
      }
    }
    if (subject) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(subject as string);
      if (looksLikeObjectId) {
        filter.subjectName = subject;
      } else {
        // Find by name and use the IDs
        const subjects = await Subject.find({ name: { $regex: subject as string, $options: 'i' } }).select('_id').lean();
        filter.subjectName = { $in: subjects.map(s => s._id) };
      }
    }
    
    if (startDate || endDate) {
      filter.loginTime = {};
      if (startDate) filter.loginTime.$gte = new Date(startDate as string);
      if (endDate) filter.loginTime.$lte = new Date(endDate as string);
    }
    
    const sessions: ITeacherSession[] = await TeacherSession.find(filter)
      .populate('courseClassName', 'name')
      .populate('sectionName', 'name')
      .populate('subjectName', 'name')
      .sort({ loginTime: -1 })
      .lean();
    
    if (sessions.length === 0) {
      res.status(404).json({
        success: false,
        message: 'No teacher sessions found for the given criteria'
      });
      return;
    }
    
    type SessionWithDisplay = ITeacherSession & { courseClassDisplay: string; sectionDisplay: string; subjectDisplay: string };
    const sessionsWithDisplay: SessionWithDisplay[] = sessions.map((s: any) => ({
      ...s,
      courseClassDisplay: s.courseClassName && typeof s.courseClassName === 'object' && 'name' in s.courseClassName ? s.courseClassName.name : (String(s.courseClassName) || 'N/A'),
      sectionDisplay: s.sectionName && typeof s.sectionName === 'object' && 'name' in s.sectionName ? s.sectionName.name : (String(s.sectionName) || 'N/A'),
      subjectDisplay: s.subjectName && typeof s.subjectName === 'object' && 'name' in s.subjectName ? s.subjectName.name : (String(s.subjectName) || 'N/A'),
    }));

    // Compute per-session active/idle from fileAccessLog when available, fallback to session-level values
    type SessionComputed = SessionWithDisplay & { activeTimeComputed: number; idleTimeComputed: number };
    const sessionsComputed: SessionComputed[] = sessionsWithDisplay.map((s: any) => {
      // Calculate from fileAccessLog
      const activeTimeFromFiles = (s.fileAccessLog || []).reduce((acc: number, f: any) => acc + (Number(f.activeTime) || 0), 0);
      const idleTimeFromFiles = (s.fileAccessLog || []).reduce((acc: number, f: any) => acc + (Number(f.idleTime) || 0), 0);
      
      // Use session-level values if they exist and are defined, otherwise use fileAccessLog totals
      const activeTimeComputed = (s.activeTime !== undefined && s.activeTime !== null) 
        ? Number(s.activeTime) 
        : activeTimeFromFiles;
      const idleTimeComputed = (s.idleTime !== undefined && s.idleTime !== null) 
        ? Number(s.idleTime) 
        : idleTimeFromFiles;
      
      return {
        ...s,
        activeTimeComputed,
        idleTimeComputed
      };
    });

    // Calculate summary statistics
    const totalSessions = sessionsComputed.length;
    const totalActiveTime = sessionsComputed.reduce((sum, session) => sum + (session.activeTimeComputed || 0), 0);
    const totalIdleTime = sessionsComputed.reduce((sum, session) => sum + (session.idleTimeComputed || 0), 0);
    const totalEvents = sessionsWithDisplay.reduce((sum, session) => 
      sum + session.section.reduce((sectionSum, section) => sectionSum + section.events.length, 0), 0);
    const totalFileAccess = sessionsWithDisplay.reduce((sum, session) => sum + session.fileAccessLog.length, 0);
    
    // Group by teacher
    const teacherStatsDisplay = sessionsComputed.reduce((acc: any, session: SessionComputed) => {
      if (!acc[session.username]) {
        acc[session.username] = {
          sessions: 0,
          totalActiveTime: 0,
          totalIdleTime: 0,
          totalEvents: 0,
          totalFileAccess: 0,
          courseClasses: new Set<string>(),
          sections: new Set<string>(),
          subjects: new Set<string>()
        };
      }
      
      acc[session.username].sessions++;
      acc[session.username].totalActiveTime += session.activeTimeComputed || 0;
      acc[session.username].totalIdleTime += session.idleTimeComputed || 0;
      acc[session.username].totalEvents += session.section.reduce((sum: number, section: any) => sum + section.events.length, 0);
      acc[session.username].totalFileAccess += session.fileAccessLog.length;
      acc[session.username].courseClasses.add(session.courseClassDisplay);
      acc[session.username].sections.add(session.sectionDisplay);
      acc[session.username].subjects.add(session.subjectDisplay);
      
      return acc;
    }, {} as any);
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
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
    
    // Summary Sheet
    const summaryData = [
      ['Teacher Sessions Report'],
      [''],
      ['Report Period', `${startDate ? new Date(startDate as string).toLocaleDateString() : 'All Time'} - ${endDate ? new Date(endDate as string).toLocaleDateString() : 'Present'}`],
      ['Generated On', new Date().toLocaleString()],
      [''],
      ['Overall Summary'],
      ['Total Sessions', totalSessions],
      ['Total Active Time (minutes)', Math.round(totalActiveTime / (1000 * 60))],
      ['Total Idle Time (minutes)', Math.round(totalIdleTime / (1000 * 60))],
      ['Total Events', totalEvents],
      ['Total File Accesses', totalFileAccess],
      [''],
      ['Teacher Performance Summary'],
      ['Teacher Name', 'Sessions', 'Active Time (min)', 'Idle Time (min)', 'Events', 'File Access', 'Course Classes', 'Sections', 'Subjects']
    ];
    
    Object.entries(teacherStatsDisplay).forEach(([teacherName, stats]: [string, any]) => {
      summaryData.push([
        teacherName,
        stats.sessions,
        Math.round(stats.totalActiveTime / (1000 * 60)),
        Math.round(stats.totalIdleTime / (1000 * 60)),
        stats.totalEvents,
        stats.totalFileAccess,
        Array.from(stats.courseClasses).join(', '),
        Array.from(stats.sections).join(', '),
        Array.from(stats.subjects).join(', ')
      ]);
    });
    
    const summarySheet = XLSX.utils.aoa_to_sheet(truncateRows(summaryData));
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Detailed Sessions Sheet
    const sessionsData = [
      ['Teacher', 'Course Class', 'Section', 'Subject', 'Login Time', 'Logout Time', 
       'Duration (min)', 'Active Time (min)', 'Idle Time (min)', 'Events', 'File Access']
    ];
    
    sessionsComputed.forEach((session: SessionComputed) => {
      const duration = session.logoutTime 
        ? new Date(session.logoutTime).getTime() - new Date(session.loginTime).getTime()
        : Date.now() - new Date(session.loginTime).getTime();
      const totalEvents = session.section.reduce((sum: number, section: any) => sum + section.events.length, 0);
      
      sessionsData.push([
        session.username,
        session.courseClassDisplay,
        session.sectionDisplay,
        session.subjectDisplay,
        new Date(session.loginTime).toLocaleString(),
        session.logoutTime ? new Date(session.logoutTime).toLocaleString() : 'Active',
        Math.round(duration / (1000 * 60)).toString(),
        Math.round((session.activeTimeComputed || 0) / (1000 * 60)).toString(),
        Math.round((session.idleTimeComputed || 0) / (1000 * 60)).toString(),
        totalEvents.toString(),
        session.fileAccessLog.length.toString()
      ]);
    });
    
    const sessionsSheet = XLSX.utils.aoa_to_sheet(truncateRows(sessionsData));
    XLSX.utils.book_append_sheet(workbook, sessionsSheet, 'Sessions');
    
    // File Access Summary Sheet
    const fileAccessData = [
      ['Teacher', 'File Name', 'Folder Name', 'Accessed At', 'Course Class', 'Section', 'Subject']
    ];
    
    sessionsComputed.forEach((session: SessionComputed) => {
      session.fileAccessLog.forEach((file: any) => {
        fileAccessData.push([
          session.username,
          file.fileName,
          file.folderName || 'N/A',
          new Date(file.accessedAt).toLocaleString(),
          session.courseClassDisplay,
          session.sectionDisplay,
          session.subjectDisplay
        ]);
      });
    });
    
    const fileAccessSheet = XLSX.utils.aoa_to_sheet(truncateRows(fileAccessData));
    XLSX.utils.book_append_sheet(workbook, fileAccessSheet, 'File Access');
    
    // Events Summary Sheet
    const looksLikeObjectId = (val: any) => typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val);
    const sectionIdDisplayCacheExcel = new Map<string, string>();
    const sectionIdToDisplay = async (value: any): Promise<string> => {
      if (!value) return 'N/A';
      if (!looksLikeObjectId(value)) return String(value);
      const cached = sectionIdDisplayCacheExcel.get(value);
      if (cached) return cached;
      const doc = await SectionModel.findById(value).lean();
      const display = doc?.name || String(value);
      sectionIdDisplayCacheExcel.set(value, display);
      return display;
    };
    const eventsData = [
      ['Teacher', 'Course Class', 'Section', 'Subject', 'Session Section', 'Event Type', 'Timestamp', 'Data']
    ];
    
    for (const session of sessionsComputed) {
      for (const section of session.section as any[]) {
        const sectionIdDisplay = await sectionIdToDisplay(section.id);
        for (const event of section.events as any[]) {
          const dataString = JSON.stringify(event.data);
          eventsData.push([
            session.username,
            session.courseClassDisplay,
            session.sectionDisplay,
            session.subjectDisplay,
            sectionIdDisplay,
            event.type.toString(),
            new Date(event.timestamp).toLocaleString(),
            truncateForExcel(dataString)
          ]);
        }
      }
    }
    
    const eventsSheet = XLSX.utils.aoa_to_sheet(truncateRows(eventsData));
    XLSX.utils.book_append_sheet(workbook, eventsSheet, 'Events');
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="teacher-sessions-report-${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(excelBuffer);
    
  } catch (error) {
    await logger.logError('TEACHER_SESSION', 'EXPORT_BULK_EXCEL', error, req.userId || 'anonymous', req);
    res.status(500).json({
      success: false,
      message: 'Failed to export bulk sessions Excel',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
