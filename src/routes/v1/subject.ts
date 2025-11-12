import { Router } from 'express';
import {
  createSubject,
  getSubjects,
  getSubjectById,
  updateSubject,
  deleteSubject,
} from '../../controllers/v1/subject/subject';

const router = Router();

router.post('/', createSubject);
router.get('/', getSubjects);
router.get('/:id', getSubjectById);
router.patch('/:id', updateSubject);
router.delete('/:id', deleteSubject);

export default router;
