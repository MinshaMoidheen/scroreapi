import { Router } from 'express';
import authenticate from '@/middlewares/authenticate';
import { getDashboardStats } from '@/controllers/v1/dashboard/dashboard';

const router = Router();

router.get('/', authenticate, getDashboardStats);

export default router;

