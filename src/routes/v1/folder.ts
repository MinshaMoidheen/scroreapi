import { Router } from 'express';
import {
  createFolder,
  getFolders,
  getFolderById,
  getSubfolders,

  updateFolder,
  deleteFolder,
} from '../../controllers/v1/folder/folder';
import { checkFolderAccess } from '../../middlewares/authorize';
import authenticate from '../../middlewares/authenticate';
import checkTeacherSession from '../../middlewares/checkTeacherSession';

const router = Router();

router.post('/', authenticate, checkTeacherSession, createFolder);
router.get('/', authenticate, checkTeacherSession, getFolders);
router.get('/subfolders/:parentId', authenticate, checkTeacherSession, getSubfolders);
router.get('/:id', checkFolderAccess, getFolderById);
router.patch('/:id', checkFolderAccess, updateFolder);
router.delete('/:id', checkFolderAccess, deleteFolder);

export default router;
