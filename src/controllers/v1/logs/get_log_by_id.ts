import { Request, Response } from 'express';
import LogModel from '@/models/log';
import { logger } from '@/lib/manualLogger';

// Get a specific log by ID
export default async (req: Request, res: Response): Promise<void> => {
  try {
    const { logId } = req.params;

    const Log = LogModel();
    
    const log = await Log.findById(logId)
      .populate('userId', 'username email firstName lastName')
      .lean();

    if (!log) {
      res.status(404).json({
        success: false,
        message: 'Log not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: log
    });
  } catch (error) {
    await logger.logError('LOG', 'GET_BY_ID', error, req.userId || 'anonymous', req);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch log',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
