import cron from 'node-cron';
import TeacherSession from '@/models/teacherSession';
import Token from '@/models/token';
import User from '@/models/user';
import { logger } from '@/lib/manualLogger';

// Teacher session timeout: 1 hour 15 minutes = 75 minutes = 4500000 milliseconds
const TEACHER_SESSION_TIMEOUT_MS = 75 * 60 * 1000; // 75 minutes in milliseconds

/**
 * Cron job to check and expire teacher sessions that have exceeded 75 minutes
 * Runs every 5 minutes
 */
const checkAndExpireTeacherSessions = async (): Promise<void> => {
  try {
    const now = new Date();
    const expirationTime = new Date(now.getTime() - TEACHER_SESSION_TIMEOUT_MS);

    // Find all active teacher sessions that have exceeded the timeout
    // Check both loginTime and loginAt fields
    const expiredSessions = await TeacherSession.find({
      active: true,
      $and: [
        {
          $or: [
            { logoutTime: null },
            { logoutTime: { $exists: false } }
          ]
        },
        {
          $or: [
            { logoutAt: null },
            { logoutAt: { $exists: false } }
          ]
        },
        {
          $or: [
            { loginTime: { $lte: expirationTime } },
            { loginAt: { $lte: expirationTime } }
          ]
        }
      ]
    }).lean().exec();

    if (expiredSessions.length === 0) {
      return;
    }

    logger.info(`Found ${expiredSessions.length} expired teacher session(s) to log out`);

    // Group sessions by username to get unique users and their session IDs
    const usernameToSessionIds = new Map<string, string[]>();
    const uniqueUsernames = new Set<string>();

    for (const session of expiredSessions) {
      if (!usernameToSessionIds.has(session.username)) {
        usernameToSessionIds.set(session.username, []);
        uniqueUsernames.add(session.username);
      }
      usernameToSessionIds.get(session.username)!.push(session._id.toString());
    }

    // Get user IDs for all unique usernames
    const userIdsToLogout: string[] = [];
    for (const username of uniqueUsernames) {
      const user = await User.findOne({ username }).select('_id').lean().exec();
      if (user) {
        userIdsToLogout.push(user._id.toString());
      }
    }

    const currentTime = new Date();

    // Update all expired sessions by username
    for (const [username, sessionIds] of usernameToSessionIds.entries()) {
      const invalidatedToken = `INVALIDATED_${Date.now()}_${username}`;
      
      await TeacherSession.updateMany(
        {
          username,
          _id: { $in: sessionIds },
          active: true
        },
        {
          $set: {
            active: false,
            logoutAt: currentTime,
            logoutTime: currentTime,
            sessionToken: invalidatedToken // Invalidate session token
          }
        }
      );
    }

    // Delete all refresh tokens for affected users
    if (userIdsToLogout.length > 0) {
      const deleteResult = await Token.deleteMany({ 
        userId: { $in: userIdsToLogout } 
      });
      logger.info(`Deleted ${deleteResult.deletedCount} refresh token(s) for ${userIdsToLogout.length} expired session user(s)`);
    }

    logger.info(`Successfully logged out ${expiredSessions.length} expired teacher session(s)`);
  } catch (error) {
    logger.error('Error in checkAndExpireTeacherSessions cron job:', error);
  }
};

/**
 * Start the cron job to check for expired teacher sessions
 * Runs every 5 minutes
 */
export const startSessionExpirationCron = (): void => {
  // Run every 5 minutes: '*/5 * * * *'
  // To run every minute for testing: '* * * * *'
  cron.schedule('*/5 * * * *', async () => {
    await checkAndExpireTeacherSessions();
  });

  logger.info('Teacher session expiration cron job started (runs every 5 minutes)');
  
  // Run immediately on startup to catch any expired sessions
  checkAndExpireTeacherSessions().catch((error) => {
    logger.error('Error in initial session expiration check:', error);
  });
};

export default startSessionExpirationCron;

