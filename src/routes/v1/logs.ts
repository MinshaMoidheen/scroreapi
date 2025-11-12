import { Router } from 'express';
import authenticate from '@/middlewares/authenticate';
import authorize from '@/middlewares/authorize';

// Import log controllers
import getAllLogs from '@/controllers/v1/logs/get_all_logs';
import searchLogs from '@/controllers/v1/logs/search_logs';
import getLogById from '@/controllers/v1/logs/get_log_by_id';
import deleteLog from '@/controllers/v1/logs/delete_log';
import getLogsByUser from '@/controllers/v1/logs/get_logs_by_user';

const router = Router();

// All log routes require authentication
router.use(authenticate);

// Get all logs - Admin and Superadmin only
router.get('/', authorize(['admin', 'superadmin']), getAllLogs);

// Search logs - Admin and Superadmin only
router.get('/search', authorize(['admin', 'superadmin']), searchLogs);

// Get log by ID - Admin and Superadmin only
router.get('/:logId', authorize(['admin', 'superadmin']), getLogById);

// Delete log - Superadmin only
router.delete('/:logId', authorize(['superadmin']), deleteLog);

// Get logs by user - Users can view their own, Admin/Superadmin can view any
router.get('/user/:userId', getLogsByUser);

export default router;
