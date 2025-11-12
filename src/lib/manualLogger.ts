import fs from 'fs';
import path from 'path';
import config from '@/config';
import LogModel from '@/models/log';
import { Types } from 'mongoose';
import User from '@/models/user';

interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

const LOG_LEVELS: LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

interface LogEntry {
  level: string;
  message: string;
  module?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  ip?: string;
  userAgent?: string;
  duration?: number;
  error?: string;
  stack?: string;
  action?: string;
  documentId?: string;
  changes?: Array<{
    field: string;
    oldValue?: any;
    newValue?: any;
  }>;
  [key: string]: any;
}

interface ChangeData {
  field: string;
  oldValue?: any;
  newValue?: any;
}

class ManualLogger {
  private logsDir: string;
  private env: string;

  constructor() {
    this.env = config.NODE_ENV || 'development';
    this.logsDir = path.join(process.cwd(), 'uploads', 'logs');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private getDailyLogFilePath(): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logsDir, `activity-${today}.log`);
  }

  private async getUserDetails(userId: string | Types.ObjectId): Promise<{ email?: string; name?: string; role?: string }> {
    try {
      const user = await User.findById(userId).select('email username role').lean();
      if (user) {
        return {
          email: user.email,
          name: user.username || 'Unknown',
          role: user.role
        };
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
    }
    return {};
  }

  private formatLogEntry(entry: LogEntry): string {
    const timestamp = new Date().toISOString();
    return JSON.stringify({
      timestamp,
      ...entry
    });
  }

  private async writeToFile(entry: LogEntry, userDetails: { email?: string; name?: string; role?: string }): Promise<void> {
    try {
      const logFilePath = this.getDailyLogFilePath();
      const logEntry = {
        _id: new Types.ObjectId().toString(),
        companyId: entry.companyId || 'default-company',
        action: entry.action || 'LOG',
        module: entry.module || 'SYSTEM',
        description: entry.message,
        userRole: userDetails.role || 'unknown',
        userId: entry.userId?.toString(),
        userEmail: userDetails.email,
        userName: userDetails.name,
        documentId: entry.documentId?.toString(),
        changes: entry.changes || [],
        ip: entry.ip,
        userAgent: entry.userAgent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      // Read existing logs from file
      let existingLogs: any[] = [];
      if (fs.existsSync(logFilePath)) {
        try {
          const fileContent = fs.readFileSync(logFilePath, 'utf8');
          if (fileContent.trim()) {
            existingLogs = JSON.parse(fileContent);
          }
        } catch (error) {
          console.error('Error reading existing log file:', error);
          existingLogs = [];
        }
      }

      // Add new log entry
      existingLogs.push(logEntry);

      // Write back to file
      fs.writeFileSync(logFilePath, JSON.stringify(existingLogs, null, 2));
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private async writeToDatabase(entry: LogEntry, userDetails: { email?: string; name?: string; role?: string }): Promise<void> {
    try {
      // Only write to database if it's an activity log (has module and userId)
      if (entry.module && entry.userId) {
        // Validate and coerce userId to ObjectId
        let userObjectId: Types.ObjectId | null = null;
        // Handle string or ObjectId-like userId
        if (typeof entry.userId === 'string' && Types.ObjectId.isValid(entry.userId)) {
          userObjectId = new Types.ObjectId(entry.userId);
        } else if (entry.userId && (entry.userId as any)._bsontype === 'ObjectID') {
          // already an ObjectId instance
          userObjectId = entry.userId as any as Types.ObjectId;
        } else {
          // If userId is not a valid ObjectId, skip structured DB logging
          console.warn('Skipping DB activity log: invalid userId', { userId: entry.userId, module: entry.module, action: entry.action });
          return;
        }

        const Log = LogModel();
        const logEntry = new Log({
          companyId: entry.companyId || 'default-company',
          action: (entry.action || 'LOG').toString().toUpperCase(),
          module: entry.module.toString().toUpperCase(),
          description: entry.message,
          userRole: userDetails.role || 'unknown',
          userId: userObjectId,
          userEmail: userDetails.email,
          userName: userDetails.name,
          documentId: entry.documentId || undefined,
          changes: entry.changes || [],
          ip: entry.ip,
          userAgent: entry.userAgent,
          timestamp: new Date()
        });

        await logEntry.save();
      }
    } catch (error) {
      console.error('Failed to write to database (activity log):', error);
    }
  }

  private shouldLog(level: string): boolean {
    const currentLevel = config.LOG_LEVEL || 'info';
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(currentLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex <= currentLevelIndex;
  }

  private async log(level: string, message: string, meta: any = {}): Promise<void> {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      ...meta
    };

    // Write to console in development
    if (this.env !== 'production') {
      const consoleMessage = `${new Date().toISOString()} [${level.toUpperCase()}]: ${message}`;
      if (Object.keys(meta).length > 0) {
        console.log(consoleMessage, meta);
      } else {
        console.log(consoleMessage);
      }
    }

    // Get user details for activity logs
    let userDetails: { email?: string; name?: string; role?: string } = {};
    if (meta.userId) {
      userDetails = await this.getUserDetails(meta.userId);
    }

    // Write to both database and file for activity logs
    if (meta.module && meta.userId) {
      await Promise.all([
        this.writeToDatabase(entry, userDetails),
        this.writeToFile(entry, userDetails)
      ]);
    }
  }

  error(message: string, meta: any = {}): void {
    this.log(LOG_LEVELS.ERROR, message, meta);
  }

  warn(message: string, meta: any = {}): void {
    this.log(LOG_LEVELS.WARN, message, meta);
  }

  info(message: string, meta: any = {}): void {
    this.log(LOG_LEVELS.INFO, message, meta);
  }

  debug(message: string, meta: any = {}): void {
    this.log(LOG_LEVELS.DEBUG, message, meta);
  }

  // Helper method to create change tracking for updates
  createChangeData(oldData: any, newData: any, fieldsToTrack?: string[]): ChangeData[] {
    const changes: ChangeData[] = [];
    
    if (!oldData || !newData) return changes;

    const fields = fieldsToTrack || Object.keys(newData);
    
    for (const field of fields) {
      const oldValue = oldData[field];
      const newValue = newData[field];
      
      // Only track if values are different
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field,
          oldValue: oldValue !== undefined ? oldValue : null,
          newValue: newValue !== undefined ? newValue : null
        });
      }
    }
    
    return changes;
  }

  // Helper method for CREATE operations
  async logCreate(
    module: string,
    documentId: string | Types.ObjectId,
    data: any,
    userId: string | Types.ObjectId,
    req?: any
  ): Promise<void> {
    const changes = Object.keys(data).map(field => ({
      field,
      oldValue: null,
      newValue: data[field]
    }));

    await this.log('info', `${module} record created successfully`, {
      action: 'CREATE',
      module,
      userId,
      documentId: documentId.toString(),
      changes,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent')
    });
  }

  // Helper method for UPDATE operations
  async logUpdate(
    module: string,
    documentId: string | Types.ObjectId,
    oldData: any,
    newData: any,
    userId: string | Types.ObjectId,
    fieldsToTrack?: string[],
    req?: any
  ): Promise<void> {
    const changes = this.createChangeData(oldData, newData, fieldsToTrack);

    await this.log('info', `${module} record updated successfully`, {
      action: 'UPDATE',
      module,
      userId,
      documentId: documentId.toString(),
      changes,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent')
    });
  }

  // Helper method for DELETE operations
  async logDelete(
    module: string,
    documentId: string | Types.ObjectId,
    data: any,
    userId: string | Types.ObjectId,
    req?: any
  ): Promise<void> {
    const changes = Object.keys(data).map(field => ({
      field,
      oldValue: data[field],
      newValue: null
    }));

    await this.log('info', `${module} record deleted successfully`, {
      action: 'DELETE',
      module,
      userId,
      documentId: documentId.toString(),
      changes,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent')
    });
  }

  // Helper method for LOGIN operations
  async logLogin(
    userId: string | Types.ObjectId,
    req?: any
  ): Promise<void> {
    await this.log('info', 'User logged in successfully', {
      action: 'LOGIN',
      module: 'AUTH',
      userId,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent')
    });
  }

  // Helper method for LOGOUT operations
  async logLogout(
    userId: string | Types.ObjectId,
    req?: any
  ): Promise<void> {
    await this.log('info', 'User logged out successfully', {
      action: 'LOGOUT',
      module: 'AUTH',
      userId,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent')
    });
  }

  // Helper method for IMPORT operations
  async logImport(
    module: string,
    description: string,
    userId: string | Types.ObjectId,
    req?: any
  ): Promise<void> {
    await this.log('info', description, {
      action: 'IMPORT',
      module,
      userId,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent')
    });
  }

  // Helper method for EXPORT operations
  async logExport(
    module: string,
    description: string,
    userId: string | Types.ObjectId,
    req?: any
  ): Promise<void> {
    await this.log('info', description, {
      action: 'EXPORT',
      module,
      userId,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent')
    });
  }

  // Helper method for ERROR operations
  async logError(
    module: string,
    operation: string,
    error: any,
    userId: string | Types.ObjectId,
    req?: any,
    additionalData?: any
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await this.log('error', `${module} ${operation} failed: ${errorMessage}`, {
      action: 'ERROR',
      module,
      userId,
      error: errorMessage,
      stack: errorStack,
      operation,
      ...additionalData,
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get?.('User-Agent')
    });
  }

  // Special method for access logs
  access(message: string, meta: any = {}): void {
    const entry: LogEntry = {
      level: 'info',
      message,
      ...meta
    };

    // Write to console in development
    if (this.env !== 'production') {
      console.log(`${new Date().toISOString()} [ACCESS]: ${message}`, meta);
    }

    // For access logs, just write to file without database
    this.writeToFile(entry, {});
  }
}

// Create singleton instances
export const logger = new ManualLogger();
export const accessLogger = new ManualLogger();

export default logger;
