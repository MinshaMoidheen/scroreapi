import { Router } from 'express';

import authRoutes from '@/routes/v1/auth';
import userRoutes from '@/routes/v1/user';
import logsRoutes from '@/routes/v1/logs';
import folderRoutes from '@/routes/v1/folder';
import fileRoutes from '@/routes/v1/file';
import courseClassRoutes from '@/routes/v1/courseClass';
import sectionRoutes from '@/routes/v1/section';
import subjectRoutes from '@/routes/v1/subject';
import teacherSessionRoutes from '@/routes/v1/teacherSession';
import dashboardRoutes from '@/routes/v1/dashboard';
import meetingRoutes from '@/routes/v1/meeting';
import studentRoutes from '@/routes/v1/student';

const router = Router();

router.get('/', (req, res) => {
  res.status(200).json({
    message: 'API is live',
    status: 'ok',
    version: '1.0.0',
    docs: 'https://example.com',
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/logs', logsRoutes);
router.use('/folders', folderRoutes);
router.use('/files', fileRoutes);
router.use('/course-classes', courseClassRoutes);
router.use('/sections', sectionRoutes);
router.use('/subjects', subjectRoutes);
router.use('/teacher-sessions', teacherSessionRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/meetings', meetingRoutes);
router.use('/students', studentRoutes);
// Student-specific routes are nested under /students (e.g., /students/folders, /students/meetings)

export default router;
