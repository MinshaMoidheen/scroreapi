import { Request, Response } from 'express';
import LogModel from '@/models/log';
import { logger } from '@/lib/manualLogger';

// Get all logs with pagination and filtering
export default async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '50',
      action,
      module,
      userRole,
      userId,
      userEmail,
      startDate,
      endDate,
      companyId
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const filter: any = {};
    
    if (action) filter.action = { $regex: action as string, $options: 'i' };
    if (module) filter.module = { $regex: module as string, $options: 'i' };
    if (userRole) filter.userRole = userRole;
    if (userId) filter.userId = userId;
    if (userEmail) filter.userEmail = { $regex: userEmail as string, $options: 'i' };
    if (companyId) filter.companyId = companyId;
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate as string);
      if (endDate) filter.timestamp.$lte = new Date(endDate as string);
    }

    const Log = LogModel();
    
    // Get total count for pagination
    const totalLogs = await Log.countDocuments(filter);
    
    // Get logs with pagination
    // Note: Not populating userId because Log uses separate connection
    // The log document already contains userName and userEmail fields
    const logs = await Log.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalPages = Math.ceil(totalLogs / limitNum);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalLogs,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    await logger.logError('LOG', 'GET_ALL', error, req.userId || 'anonymous', req);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
