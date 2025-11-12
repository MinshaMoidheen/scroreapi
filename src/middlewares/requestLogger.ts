import { Request, Response, NextFunction } from 'express';
import { accessLogger } from '@/lib/manualLogger';

interface RequestWithStartTime extends Request {
  startTime?: number;
}

export const requestLogger = (req: RequestWithStartTime, res: Response, next: NextFunction) => {
  req.startTime = Date.now();
  
  // Log the request
  accessLogger.access('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Override res.end to log the response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    
    accessLogger.access('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
};
