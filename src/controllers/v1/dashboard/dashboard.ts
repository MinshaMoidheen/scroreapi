import { Request, Response } from 'express';
import ControllerLogger from '@/utils/controllerLogger';
import User from '@/models/user';
import CourseClass from '@/models/courseClass';
import Subject from '@/models/subject';
import Folder from '@/models/folder';
import TeacherSession from '@/models/teacherSession';

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get Dashboard Stats', 'baseline', {
    userId: req.userId?.toString(),
  });

  try {
    // Get total counts
    const [totalTeachers, totalCourseClasses, totalSubjects, totalParentFolders] = await Promise.all([
      // Total teachers (users with role='teacher')
      User.countDocuments({
        role: 'teacher',
        'isDeleted.status': { $ne: true },
      }),
      // Total course classes
      CourseClass.countDocuments({
        'isDeleted.status': { $ne: true },
      }),
      // Total subjects
      Subject.countDocuments({
        'isDeleted.status': { $ne: true },
      }),
      // Total parent folders (folders with no parent)
      Folder.countDocuments({
        parent: { $in: [null, undefined] },
        'isDeleted.status': { $ne: true },
      }),
    ]);

    // Get teacher duration data for current month (for graph)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get all teachers' duration data for current month (for graph - X-axis: teacher names, Y-axis: duration)
    // Use the same query structure as topTeachers but without limit to get all teachers
    const teacherDurationData = await TeacherSession.aggregate([
      {
        $match: {
          loginTime: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
          'isDeleted.status': { $ne: true },
        },
      },
      {
        $group: {
          _id: '$username',
          totalActiveTime: { $sum: { $ifNull: ['$activeTime', 0] } }, // Handle null/undefined activeTime
        },
      },
      {
        $lookup: {
          from: 'users',
          let: { usernameValue: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$username', '$$usernameValue'] },
                    { $eq: ['$role', 'teacher'] },
                  ],
                },
                'isDeleted.status': { $ne: true },
              },
            },
            {
              $project: {
                username: 1,
              },
            },
          ],
          as: 'userDetails',
        },
      },
      {
        $unwind: {
          path: '$userDetails',
          preserveNullAndEmptyArrays: false, // Only include teachers that exist in users collection
        },
      },
      {
        $project: {
          teacherName: '$_id',
          duration: {
            $round: [{ $divide: [{ $ifNull: ['$totalActiveTime', 0] }, 3600000] }, 2],
          }, // Duration in hours
          _id: 0,
        },
      },
      {
        $sort: { duration: -1 },
      },
    ]);

    // Get top 5 high performance teachers per month (current month)
    // First, get all usernames that are teachers
    const teacherUsernames = await User.find({
      role: 'teacher',
      'isDeleted.status': { $ne: true },
    })
      .select('username')
      .lean()
      .then((users) => users.map((u) => u.username));

    const topTeachers = await TeacherSession.aggregate([
      {
        $match: {
          loginTime: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
          username: { $in: teacherUsernames }, // Only include sessions from teachers
          'isDeleted.status': { $ne: true },
        },
      },
      {
        $group: {
          _id: '$username',
          totalActiveTime: { $sum: '$activeTime' },
          totalSessions: { $sum: 1 },
          avgActiveTime: { $avg: '$activeTime' },
        },
      },
      {
        $lookup: {
          from: 'users',
          let: { usernameValue: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$username', '$$usernameValue'] },
                    { $eq: ['$role', 'teacher'] },
                  ],
                },
                'isDeleted.status': { $ne: true },
              },
            },
            {
              $project: {
                username: 1,
                email: 1,
              },
            },
          ],
          as: 'userDetails',
        },
      },
      {
        $unwind: {
          path: '$userDetails',
          preserveNullAndEmptyArrays: false, // Only include teachers that exist in users collection
        },
      },
      {
        $sort: { totalActiveTime: -1 },
      },
      {
        $limit: 5,
      },
      {
        $project: {
          username: '$_id',
          email: { $ifNull: ['$userDetails.email', 'N/A'] },
          totalActiveTime: 1,
          totalSessions: 1,
          avgActiveTime: {
            $round: ['$avgActiveTime', 2],
          },
          totalActiveTimeHours: {
            $round: [{ $divide: ['$totalActiveTime', 3600000] }, 2],
          },
        },
      },
    ]);

    // Format teacher duration data for chart (X-axis: teacher names, Y-axis: duration in hours)
    const chartData = teacherDurationData.map((item) => ({
      teacherName: item.teacherName,
      duration: item.duration, // Duration in hours
    }));

    res.status(200).json({
      message: 'Dashboard stats retrieved successfully',
      stats: {
        totalTeachers,
        totalCourseClasses,
        totalSubjects,
        totalParentFolders,
      },
      teacherDurationGraph: chartData,
      topTeachers: topTeachers.map((teacher) => ({
        username: teacher.username,
        email: teacher.email,
        totalActiveTime: teacher.totalActiveTime,
        totalActiveTimeHours: teacher.totalActiveTimeHours,
        totalSessions: teacher.totalSessions,
        avgActiveTime: teacher.avgActiveTime,
      })),
    });

    ControllerLogger.logSuccess(req, 'Get Dashboard Stats', 'baseline', {
      userId: req.userId?.toString(),
      totalTeachers,
      totalCourseClasses,
      totalSubjects,
      totalParentFolders,
      chartDataPoints: chartData.length,
      topTeachersCount: topTeachers.length,
      teacherDurationDataPoints: teacherDurationData.length,
    });
  } catch (err) {
    ControllerLogger.logError(req, 'Get Dashboard Stats', 'baseline', err, {
      userId: req.userId?.toString(),
    });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

