import { Router } from 'express';
import {
  getAllTeacherSessions,
  getTeacherSessionById,
  createTeacherSession,
  updateTeacherSession,
  deleteTeacherSession,
  searchTeacherSessions,
  getSectionsBySession
} from '@/controllers/v1/teacherSession/teacherSession';
import {
  exportIndividualSession
} from '@/controllers/v1/teacherSession/exportIndividual';
import {
  exportBulkSessionsPDF,
  exportBulkSessionsExcel
} from '@/controllers/v1/teacherSession/exportBulk';
import authenticate from '@/middlewares/authenticate';
import authorize from '@/middlewares/authorize';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// CRUD Routes for Teacher Sessions
// Get all teacher sessions with pagination and filtering
router.get('/', getAllTeacherSessions);

// Search teacher sessions with advanced filtering
router.get('/search', searchTeacherSessions);

// Get teacher session by ID
router.get('/:id', getTeacherSessionById);

// Get sections by session ID
router.get('/:id/sections', getSectionsBySession);

// Create new teacher session
router.post('/', createTeacherSession);

// Update teacher session
router.put('/:id', updateTeacherSession);

// Delete teacher session
router.delete('/:id', deleteTeacherSession);

// Export Routes
// Export individual session
router.get('/export/individual/:id', exportIndividualSession);

// Export bulk sessions as PDF
router.get('/export/bulk/pdf', exportBulkSessionsPDF);

// Export bulk sessions as Excel
router.get('/export/bulk/excel', exportBulkSessionsExcel);

export default router;
