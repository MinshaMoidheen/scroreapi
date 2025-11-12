import { Router } from 'express';
import {
  createSection,
  getSections,
  getSectionById,
  updateSection,
  deleteSection,
} from '../../controllers/v1/section/section';

const router = Router();

router.post('/', createSection);
router.get('/', getSections);
router.get('/:id', getSectionById);
router.patch('/:id', updateSection);
router.delete('/:id', deleteSection);

export default router;
