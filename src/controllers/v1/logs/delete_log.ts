import { Request, Response } from 'express';
import LogModel from '@/models/log';
import { logger } from '@/lib/manualLogger';

// Delete a specific log by ID
export default async (req: Request, res: Response): Promise<void> => {
  try {
    const { logId } = req.params;

    const Log = LogModel();
    
    const log = await Log.findByIdAndDelete(logId);

    if (!log) {
      res.status(404).json({
        success: false,
        message: 'Log not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Log deleted successfully'
    });
  } catch (error) {
    await logger.logError('LOG', 'DELETE', error, req.userId || 'anonymous', req);
    res.status(500).json({
      success: false,
      message: 'Failed to delete log',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
