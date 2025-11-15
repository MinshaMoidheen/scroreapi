import Folder from '@/models/folder';
import Student from '@/models/student';
import { Request, Response } from 'express';
import { Types } from 'mongoose';

/**
 * Get folders for a student based on their class and section
 */
export const getStudentFolders = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.studentId || req.userId;
    
    if (!studentId) {
      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Student not authenticated',
      });
      return;
    }

    // Get student details to filter by class and section
    // Don't populate here - we need the raw ObjectIds for filtering
    const student = await Student.findById(studentId)
      .select('courseClass section')
      .lean()
      .exec();

    if (!student) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Student not found',
      });
      return;
    }

    // Build filter based on student's class and section
    const filter: any = {
      'isDeleted.status': { $ne: true },
    };

    // Handle courseClass - it might be an ObjectId or already a string
    if (student.courseClass) {
      let courseClassId: Types.ObjectId;
      if (student.courseClass instanceof Types.ObjectId) {
        courseClassId = student.courseClass;
      } else if (typeof student.courseClass === 'object' && student.courseClass !== null && '_id' in student.courseClass) {
        courseClassId = new Types.ObjectId((student.courseClass as any)._id.toString());
      } else {
        courseClassId = new Types.ObjectId(String(student.courseClass));
      }
      filter.courseClass = courseClassId;
    }
    
    // Handle section - it might be an ObjectId or already a string
    if (student.section) {
      let sectionId: Types.ObjectId;
      if (student.section instanceof Types.ObjectId) {
        sectionId = student.section;
      } else if (typeof student.section === 'object' && student.section !== null && '_id' in student.section) {
        sectionId = new Types.ObjectId((student.section as any)._id.toString());
      } else {
        sectionId = new Types.ObjectId(String(student.section));
      }
      filter.section = sectionId;
    }

    const folders = await Folder.find(filter)
      .populate('parent')
      .populate('allowedUsers')
      .populate('files')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(folders);
  } catch (err) {
    res.status(500).json({
      code: 'ServerError',
      message: 'Error while getting student folders',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    console.error('Error while getting student folders', err);
  }
};

/**
 * Get subfolders for a student
 */
export const getStudentSubfolders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { parentId } = req.params;
    const studentId = req.studentId || req.userId;

    if (!studentId) {
      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Student not authenticated',
      });
      return;
    }

    // Get student details
    // Don't populate here - we need the raw ObjectIds for filtering
    const student = await Student.findById(studentId)
      .select('courseClass section')
      .lean()
      .exec();

    if (!student) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Student not found',
      });
      return;
    }

    // Build filter
    const filter: any = {
      parent: parentId,
      'isDeleted.status': { $ne: true },
    };

    // Handle courseClass - it might be an ObjectId or already a string
    if (student.courseClass) {
      let courseClassId: Types.ObjectId;
      if (student.courseClass instanceof Types.ObjectId) {
        courseClassId = student.courseClass;
      } else if (typeof student.courseClass === 'object' && student.courseClass !== null && '_id' in student.courseClass) {
        courseClassId = new Types.ObjectId((student.courseClass as any)._id.toString());
      } else {
        courseClassId = new Types.ObjectId(String(student.courseClass));
      }
      filter.courseClass = courseClassId;
    }
    
    // Handle section - it might be an ObjectId or already a string
    if (student.section) {
      let sectionId: Types.ObjectId;
      if (student.section instanceof Types.ObjectId) {
        sectionId = student.section;
      } else if (typeof student.section === 'object' && student.section !== null && '_id' in student.section) {
        sectionId = new Types.ObjectId((student.section as any)._id.toString());
      } else {
        sectionId = new Types.ObjectId(String(student.section));
      }
      filter.section = sectionId;
    }

    const subfolders = await Folder.find(filter)
      .populate('allowedUsers')
      .populate('files')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(subfolders);
  } catch (err) {
    res.status(500).json({
      code: 'ServerError',
      message: 'Error while getting student subfolders',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    console.error('Error while getting student subfolders', err);
  }
};

/**
 * Get folder by ID for a student
 */
export const getStudentFolderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const studentId = req.studentId || req.userId;

    if (!studentId) {
      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Student not authenticated',
      });
      return;
    }

    // Get student details
    // Don't populate here - we need the raw ObjectIds for comparison
    const student = await Student.findById(studentId)
      .select('courseClass section')
      .lean()
      .exec();

    if (!student) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Student not found',
      });
      return;
    }

    const folder = await Folder.findOne({
      _id: id,
      'isDeleted.status': { $ne: true },
    })
      .populate('parent')
      .populate('allowedUsers')
      .populate('files')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name');

    if (!folder) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Folder not found',
      });
      return;
    }

    // Verify folder belongs to student's class and section
    // Handle both ObjectId and populated object cases
    const getObjectIdString = (value: any): string | null => {
      if (!value) return null;
      if (value instanceof Types.ObjectId) return value.toString();
      if (typeof value === 'object' && value !== null && '_id' in value) {
        return (value as any)._id.toString();
      }
      return String(value);
    };
    
    const folderClass = getObjectIdString(folder.courseClass);
    const folderSection = getObjectIdString(folder.section);
    const studentClass = getObjectIdString(student.courseClass);
    const studentSection = getObjectIdString(student.section);

    if (folderClass !== studentClass || folderSection !== studentSection) {
      res.status(403).json({
        code: 'Forbidden',
        message: 'You do not have access to this folder',
      });
      return;
    }

    res.status(200).json(folder);
  } catch (err) {
    res.status(500).json({
      code: 'ServerError',
      message: 'Error while getting folder',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    console.error('Error while getting student folder by id', err);
  }
};

