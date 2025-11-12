import { Router } from 'express';
import {
  createFile,
  getFiles,
  getFilesByFolder,
  getFileById,
  updateFile,
  deleteFile,
  serveFile,
} from '../../controllers/v1/file/file';
import { checkFileAccess } from '../../middlewares/authorize';
import authenticate from '../../middlewares/authenticate';
import checkTeacherSession from '../../middlewares/checkTeacherSession';

const router = Router();

router.post('/', authenticate, checkTeacherSession, createFile);
router.get('/', authenticate, checkTeacherSession, getFiles);
router.get('/folder/:folderId', authenticate, checkTeacherSession, getFilesByFolder);
router.get('/serve/:filename', serveFile); // Public endpoint for serving files
router.options('/serve/:filename', (req, res) => {
  // Handle preflight requests
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});
router.get('/:id', authenticate, checkTeacherSession, checkFileAccess, getFileById);
router.patch('/:id', authenticate, checkTeacherSession, checkFileAccess, updateFile);
router.delete('/:id', authenticate, checkTeacherSession, checkFileAccess, deleteFile);

export default router;
