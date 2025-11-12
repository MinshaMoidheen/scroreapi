import Subject from '../../../models/subject';
import { Request, Response } from 'express';

export const createSubject = async (req: Request, res: Response) => {
  try {
    const { name, code, description } = req.body;
    const subject = await Subject.create({ name, code, description });
    res.status(201).json(subject);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const getSubjects = async (req: Request, res: Response) => {
  try {
    const subjects = await Subject.find();
    res.status(200).json(subjects);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const getSubjectById = async (req: Request, res: Response) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ error: 'Not found' });
    res.status(200).json(subject);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const updateSubject = async (req: Request, res: Response) => {
  try {
    const { name, code, description } = req.body;
    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      { name, code, description },
      { new: true },
    );
    res.status(200).json(subject);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const deleteSubject = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId?.toString();
    
    // Perform soft delete
    await Subject.findByIdAndUpdate(req.params.id, {
      isDeleted: {
        status: true,
        deletedTime: new Date(),
        deletedBy: currentUserId,
      },
    });
    
    res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};
