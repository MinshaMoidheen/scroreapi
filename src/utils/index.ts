import User from '../models/user';
import config from '../config';
import { logger } from '@/lib/manualLogger';

export const generateSuperAdminAccount = async (): Promise<void> => {
  try {
      const superadmin = await User.findOne({
      role: 'superadmin',
      email: config.WHITELIST_SUPERADMIN_MAIL,
    });

    if (superadmin) {
      return;
    }

    await User.create({
      username: config.SUPERADMIN_USERNAME,
      email: config.SUPERADMIN_MAIL,
      password: config.SUPERADMIN_PASSWORD,
      role: 'superadmin',
      access: 'all',
    });

    logger.info('Superadmin account created successfully!', {
      username: config.SUPERADMIN_USERNAME,
    });
  } catch (error) {
    logger.error('Error creating admin account:', error);
    throw error;
  }
};
