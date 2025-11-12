import Section from '../../../models/section';
import { Request, Response } from 'express';

export const createSection = async (req: Request, res: Response) => {
  try {
    const { name, courseClass } = req.body;
    const section = await Section.create({ name, courseClass });
    res.status(201).json(section);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const getSections = async (req: Request, res: Response) => {
  try {
    const sections = await Section.find().populate('courseClass');
    res.status(200).json(sections);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const getSectionById = async (req: Request, res: Response) => {
  try {
    const section = await Section.findById(req.params.id).populate(
      'courseClass',
    );
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.status(200).json(section);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const updateSection = async (req: Request, res: Response) => {
  try {
    const { name, courseClass } = req.body;
    const section = await Section.findByIdAndUpdate(
      req.params.id,
      { name, courseClass },
      { new: true },
    );
    res.status(200).json(section);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const deleteSection = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId;
    const { Types } = await import('mongoose');
    
    // Perform soft delete
    await Section.findByIdAndUpdate(req.params.id, {
      $set: {
        'isDeleted.status': true,
        'isDeleted.deletedTime': new Date(),
        'isDeleted.deletedBy': currentUserId ? new Types.ObjectId(currentUserId.toString()) : null,
      },
    });
    
    res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};
