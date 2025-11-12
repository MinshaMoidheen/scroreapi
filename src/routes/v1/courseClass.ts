import { Router } from 'express';
import {
  createCourseClass,
  getCourseClasses,
  getCourseClassById,
  updateCourseClass,
  deleteCourseClass,
} from '../../controllers/v1/courseClass/courseClass';

const router = Router();

router.post('/', createCourseClass);
router.get('/', getCourseClasses);
router.get('/:id', getCourseClassById);
router.patch('/:id', updateCourseClass);
router.delete('/:id', deleteCourseClass);

export default router;
