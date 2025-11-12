import LogModel from '../models/log';
import fs from 'fs';
import path from 'path';
import { Request } from 'express';

interface User {
  _id: string;
  companyId?: string;
  role?: string | { role: string };
}

interface ChangeData {
  field: string;
  oldValue?: any;
  newValue?: any;
}

interface LoggerResult {
  success: boolean;
  logId?: string;
  message?: string;
  error?: string;
}

const logger = async (
  user: User,
  action: string,
  module: string,
  description: string,
  documentId?: string,
  changedData?: ChangeData[],
  userRole?: string,
  req?: Request
): Promise<LoggerResult> => {
  try {
    // Validate user object
    if (!user || !user._id) {
      console.error('Logger validation failed:', { user, action, module, description });
      throw new Error('Invalid user object: must have _id');
    }

    // Get companyId - use a default if not provided
    const companyId = user.companyId || 'default-company';
    
    // If userRole is not provided, try to get it from user object
    let finalUserRole = userRole;
    if (!finalUserRole) {
      if (typeof user.role === 'string') {
        finalUserRole = user.role;
      } else if (user.role && user.role.role) {
        finalUserRole = user.role.role;
      } else {
        finalUserRole = 'unknown';
      }
    }
    
    // Validate changedData structure if provided
    if (changedData && Array.isArray(changedData)) {
      for (const change of changedData) {
        if (!change.field || (change.newValue === undefined && change.oldValue === undefined)) {
          console.error('Logger validation failed - invalid change object:', { change, action, module, description });
          throw new Error('Each change must have field property and at least one of oldValue or newValue');
        }
      }
    }

    // Get IP and User Agent from request if available
    const ip = req?.ip || req?.connection?.remoteAddress || 'unknown';
    const userAgent = req?.get('User-Agent') || 'unknown';

    // Create log entry for database
    const Log = LogModel();
    const logEntry = new Log({
      companyId,
      action: action.toUpperCase(),
      module: module.toUpperCase(),
      description,
      userRole: finalUserRole,
      userId: user._id,
      documentId: documentId || undefined,
      changes: changedData || [],
      ip,
      userAgent,
      timestamp: new Date()
    });

    // Save to database
    const savedLog = await logEntry.save();

    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs', 'activity');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create file log entry
    const fileLogEntry = {
      logId: savedLog._id,
      timestamp: new Date().toISOString(),
      companyId,
      action: action.toUpperCase(),
      module: module.toUpperCase(),
      description,
      userRole: finalUserRole,
      userId: user._id,
      documentId: documentId || null,
      changes: changedData || [],
      ip,
      userAgent
    };

    // Write to file
    const logFileName = `activity-${new Date().toISOString().split('T')[0]}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    const logLine = JSON.stringify(fileLogEntry) + '\n';
    
    fs.appendFileSync(logFilePath, logLine);
    
    return {
      success: true,
      logId: savedLog._id.toString(),
      message: 'Log entry created successfully'
    };

  } catch (error) {
    console.error('Logger error:', {
      action,
      module,
      userId: user?._id,
      documentId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

export default logger;
