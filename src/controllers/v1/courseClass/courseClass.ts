import CourseClass from '../../../models/courseClass';
import { Request, Response } from 'express';

export const createCourseClass = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const course = await CourseClass.create({ name, description });
    res.status(201).json(course);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const getCourseClasses = async (req: Request, res: Response) => {
  try {
    const courses = await CourseClass.find();
    res.status(200).json(courses);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const getCourseClassById = async (req: Request, res: Response) => {
  try {
    const course = await CourseClass.findById(req.params.id);
    if (!course) return res.status(404).json({ error: 'Not found' });
    res.status(200).json(course);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const updateCourseClass = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const course = await CourseClass.findByIdAndUpdate(req.params.id, { name, description }, { new: true });
    res.status(200).json(course);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const deleteCourseClass = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId?.toString();
    
    // Perform soft delete
    await CourseClass.findByIdAndUpdate(req.params.id, {
      isDeleted: {
        status: true,
        deletedTime: new Date(),
        deletedBy: currentUserId,
      },
    });
    
    res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};
