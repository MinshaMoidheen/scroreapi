import { Request } from 'express';
import { logger } from '@/lib/manualLogger';

interface ControllerLoggerOptions {
  action: string;
  module: string;
  userId?: string;
  startTime?: number;
  additionalData?: any;
}

export class ControllerLogger {
  private startTime: number;
  private action: string;
  private module: string;
  private userId?: string;
  private req: Request;

  constructor(req: Request, options: ControllerLoggerOptions) {
    this.req = req;
    this.startTime = options.startTime || Date.now();
    this.action = options.action;
    this.module = options.module;
    this.userId = options.userId;
  }

  logStart(additionalData?: any) {
    const clientIP = this.req.ip || this.req.connection.remoteAddress;
    const userAgent = this.req.get('User-Agent');

    logger.info(`${this.action} started`, {
      module: this.module,
      userId: this.userId,
      ip: clientIP,
      userAgent,
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }

  logSuccess(additionalData?: any) {
    const clientIP = this.req.ip || this.req.connection.remoteAddress;
    const userAgent = this.req.get('User-Agent');
    const duration = Date.now() - this.startTime;

    logger.info(`${this.action} successful`, {
      module: this.module,
      userId: this.userId,
      ip: clientIP,
      userAgent,
      duration,
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }

  logError(error: any, additionalData?: any) {
    const clientIP = this.req.ip || this.req.connection.remoteAddress;
    const userAgent = this.req.get('User-Agent');
    const duration = Date.now() - this.startTime;

    logger.error(`${this.action} failed`, {
      module: this.module,
      userId: this.userId,
      ip: clientIP,
      userAgent,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }

  // Static methods for backward compatibility
  static logStart(req: Request, action: string, module: string, additionalData?: any) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    logger.info(`${action} started`, {
      module,
      ip: clientIP,
      userAgent,
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }

  static logSuccess(req: Request, action: string, module: string, additionalData?: any) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    logger.info(`${action} successful`, {
      module,
      ip: clientIP,
      userAgent,
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }

  static logError(req: Request, action: string, module: string, error: any, additionalData?: any) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    logger.error(`${action} failed`, {
      module,
      ip: clientIP,
      userAgent,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }
}

export default ControllerLogger;
