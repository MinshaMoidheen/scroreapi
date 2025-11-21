import Section from '../../../models/section';
import { Request, Response } from 'express';

export const createSection = async (req: Request, res: Response) => {
  try {
    const { name, courseClass } = req.body;
    
    // Validate required fields
    if (!name || !courseClass) {
      return res.status(400).json({
        error: 'Name and course class are required.',
        message: 'Name and course class are required.'
      });
    }
    
    // Check for duplicate section (same name and course class)
    const existingSection = await Section.findOne({
      name: name.trim(),
      courseClass: courseClass,
      'isDeleted.status': { $ne: true }
    });
    
    if (existingSection) {
      return res.status(400).json({
        error: 'A section with this name already exists for the selected course class.',
        message: 'A section with this name already exists for the selected course class.'
      });
    }
    
    const section = await Section.create({ name: name.trim(), courseClass });
    res.status(201).json(section);
  } catch (err: any) {
    // Handle MongoDB duplicate key error
    if (err.code === 11000 || err.name === 'MongoServerError') {
      return res.status(400).json({
        error: 'A section with this name already exists for the selected course class.',
        message: 'A section with this name already exists for the selected course class.'
      });
    }
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
    
    // Prepare update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (courseClass !== undefined) updateData.courseClass = courseClass;
    
    // Check for duplicate section (same name and course class, excluding current section)
    if (updateData.name && updateData.courseClass) {
      const existingSection = await Section.findOne({
        name: updateData.name,
        courseClass: updateData.courseClass,
        _id: { $ne: req.params.id },
        'isDeleted.status': { $ne: true }
      });
      
      if (existingSection) {
        return res.status(400).json({
          error: 'A section with this name already exists for the selected course class.',
          message: 'A section with this name already exists for the selected course class.'
        });
      }
    }
    
    const section = await Section.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true },
    );
    
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }
    
    res.status(200).json(section);
  } catch (err: any) {
    // Handle MongoDB duplicate key error
    if (err.code === 11000 || err.name === 'MongoServerError') {
      return res.status(400).json({
        error: 'A section with this name already exists for the selected course class.',
        message: 'A section with this name already exists for the selected course class.'
      });
    }
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
