import { Request, Response } from 'express';
import LogModel from '@/models/log';
import { logger } from '@/lib/manualLogger';

// Get logs by user ID with pagination and filtering
export default async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId: targetUserId } = req.params;
    const {
      page = '1',
      limit = '50',
      action,
      module,
      startDate,
      endDate,
      companyId
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Check if user can access these logs
    // Users can only view their own logs unless they are admin/superadmin
    const requestingUserId = req.userId;

    if (requestingUserId && requestingUserId.toString() !== targetUserId) {
      // If user is trying to view someone else's logs, we'd need to check their role
      // For now, we'll allow it if they're authenticated
      // TODO: Add proper role-based access control
    }

    // Build filter object
    const filter: any = { userId: targetUserId };
    
    if (action) filter.action = { $regex: action as string, $options: 'i' };
    if (module) filter.module = { $regex: module as string, $options: 'i' };
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
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalLogs,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    await logger.logError('LOG', 'GET_BY_USER', error, req.userId || 'anonymous', req);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user logs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
