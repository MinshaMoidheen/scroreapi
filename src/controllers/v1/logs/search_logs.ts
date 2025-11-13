import { Request, Response } from 'express';
import LogModel from '@/models/log';
import { logger } from '@/lib/manualLogger';

// Search logs with text search
export default async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      q, // search query
      page = '1',
      limit = '50',
      action,
      module,
      userRole,
      startDate,
      endDate,
      companyId
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const filter: any = {};
    
    // Text search across multiple fields
    if (q) {
      filter.$or = [
        { description: { $regex: q as string, $options: 'i' } },
        { action: { $regex: q as string, $options: 'i' } },
        { module: { $regex: q as string, $options: 'i' } },
        { userEmail: { $regex: q as string, $options: 'i' } },
        { userName: { $regex: q as string, $options: 'i' } }
      ];
    }
    
    if (action) filter.action = { $regex: action as string, $options: 'i' };
    if (module) filter.module = { $regex: module as string, $options: 'i' };
    if (userRole) filter.userRole = userRole;
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
    const logs = await Log.find(filter)
      .populate('userId', 'username email firstName lastName')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalPages = Math.ceil(totalLogs / limitNum);

    res.status(200).json({
      success: true,
      data: logs,
      searchQuery: q,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalLogs,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    await logger.logError('LOG', 'SEARCH', error, req.userId || 'anonymous', req);
    res.status(500).json({
      success: false,
      message: 'Failed to search logs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
