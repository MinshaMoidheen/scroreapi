import Folder from '../../../models/folder';
import User from '../../../models/user';
import CourseClass from '../../../models/courseClass';
import Section from '../../../models/section';
import Subject from '../../../models/subject';
import { Request, Response } from 'express';
import TeacherSession from '../../../models/teacherSession';
import { crossOriginResourcePolicy } from 'helmet';

export const createFolder = async (req: Request, res: Response) => {
  try {
    const { folderName, parent, allowedUsers, courseClass, section, subject } = req.body;
    console.log('createFolder - received data:', { folderName, parent, allowedUsers, courseClass, section, subject });
    
    // Convert allowedUsers usernames to ObjectIds
    let allowedUserIds: any[] = [];
    if (allowedUsers && Array.isArray(allowedUsers)) {
      for (const username of allowedUsers) {
        const user = await User.findOne({ username }).select('_id');
        if (user) {
          allowedUserIds.push(user._id);
        }
      }
    }
    
    console.log('createFolder - converted allowedUsers to ObjectIds:', allowedUserIds);
    
    const folder = await Folder.create({
      folderName,
      parent: parent || null,
      allowedUsers: allowedUserIds,
      courseClass: courseClass || null,
      section: section || null,
      subject: subject || null,
    });
    
    console.log('createFolder - created folder:', folder);
    res.status(201).json(folder);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
    console.error('Error while creating folder', err);
  }
};

export const getFolders = async (req: Request, res: Response) => {
  try {
    const { courseClass, section, subject } = req.query;
    const userId = req.userId;

    console.log('getFolders - userId:', userId);
    console.log("req.query", req.query);
    
    // Import Types for ObjectId conversion
    const { Types } = require('mongoose');
    
    // Check if user is a student
    const User = (await import('@/models/user')).default;
    const Student = (await import('@/models/student')).default;
    
    const user = await User.findById(userId).select('role').lean().exec();
    const isStudent = !user; // If not found in User collection, might be a student
    
    // If student, get their class and section from Student collection
    if (isStudent) {
      const student = await Student.findById(userId)
        .select('courseClass section')
        .lean()
        .exec();
      
      if (student) {
        // Build filter based on student's class and section (no subject for students)
        const filter: any = {
          'isDeleted.status': { $ne: true },
        };
        
        if (student.courseClass) {
          filter.courseClass = new Types.ObjectId(student.courseClass.toString());
        }
        if (student.section) {
          filter.section = new Types.ObjectId(student.section.toString());
        }
        
        const folders = await Folder.find(filter)
          .populate('parent')
          .populate('allowedUsers')
          .populate('files')
          .populate('courseClass', 'name')
          .populate('section', 'name')
          .populate('subject', 'name')
          .sort({ createdAt: -1 });
        
        return res.status(200).json(folders);
      }
    }
    
    // For teachers/users: Build filter from query parameters with ObjectId conversion
    const filter: any = {
      'isDeleted.status': { $ne: true },
    };
    if (courseClass) filter.courseClass = new Types.ObjectId(courseClass as string);
    if (subject) filter.subject = new Types.ObjectId(subject as string);
    if (section) filter.section = new Types.ObjectId(section as string);
    
    console.log('Final filter:', filter);
    
    const folders = await Folder.find(filter)
      .populate('parent')
      .populate('allowedUsers')
      .populate('files')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name')
      .sort({ createdAt: -1 });
    
    console.log('Found folders:', folders.length);
    
    res.status(200).json(folders);
  } catch (err) {
    res
      .status(400)
      .json({ err: err instanceof Error ? err.message : 'Unknown error' });
    console.error('Error while getting folders', err);
  }
};

export const getFolderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const folder = await Folder.findById(id)
      .populate('parent')
      .populate('allowedUsers')
      .populate('files');
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // File access logging for teacher's session: log all files in this folder
    const userId = req.userId;
    if (userId && folder.files && Array.isArray(folder.files)) {
      // Try to get username from session
      // All files should be populated objects, not just ObjectIds
      for (const fileDoc of folder.files as any[]) {
        let ownerUsername: string | undefined = undefined;
        let fileId: string | undefined = undefined;
        let fileName: string | undefined = undefined;
        let folderId: string | undefined = undefined;
        let folderName: string | undefined = undefined;
        if (fileDoc && typeof fileDoc === 'object') {
          if ('_id' in fileDoc) fileId = fileDoc._id.toString();
          if ('filename' in fileDoc) fileName = fileDoc.filename;
          if (folder._id) folderId = folder._id.toString();
          if (folder.folderName) folderName = folder.folderName;
          if (
            fileDoc.owner &&
            typeof fileDoc.owner === 'object' &&
            'username' in fileDoc.owner
          ) {
            ownerUsername = fileDoc.owner.username;
          }
        }
        if (ownerUsername) {
          const session = await TeacherSession.findOne({
            username: ownerUsername,
            active: true,
          });
          if (session && fileId && fileName) {
            session.fileAccessLog.push({
              fileId,
              fileName,
              folderId,
              folderName,
              accessedAt: new Date(),
            });
            session.lastActiveAt = new Date();
            await session.save();
          }
        }
      }
    }
    // End logging

    res.status(200).json(folder);
  } catch (err) {
    res
      .status(400)
      .json({ err: err instanceof Error ? err.message : 'Unknown error' });
    console.error('Error while getting folder by id', err);
  }
};

export const updateFolder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { folderName, parent, allowedUsers, courseClass, section, subject } = req.body;
    console.log('updateFolder - received data:', { id, folderName, parent, allowedUsers, courseClass, section, subject });
    
    // Convert allowedUsers usernames to ObjectIds
    let allowedUserIds: any[] = [];
    if (allowedUsers && Array.isArray(allowedUsers)) {
      for (const username of allowedUsers) {
        const user = await User.findOne({ username }).select('_id');
        if (user) {
          allowedUserIds.push(user._id);
        }
      }
    }
    
    console.log('updateFolder - converted allowedUsers to ObjectIds:', allowedUserIds);
    
    const folder = await Folder.findByIdAndUpdate(
      id,
      { 
        folderName, 
        parent: parent || null, 
        allowedUsers: allowedUserIds,
        courseClass: courseClass || null,
        section: section || null,
        subject: subject || null,
      },
      { new: true },
    );
    
    console.log('updateFolder - updated folder:', folder);
    res.status(200).json(folder);
  } catch (err) {
    res
      .status(400)
      .json({ err: err instanceof Error ? err.message : 'Unknown error' });
    console.error('Error while updating folder', err);
  }
};

export const getSubfolders = async (req: Request, res: Response) => {
  try {
    const { parentId } = req.params;
    const userId = req.userId;
    
    console.log('Backend getSubfolders received parentId:', parentId);
    
    // Check if user is a student
    const User = (await import('@/models/user')).default;
    const Student = (await import('@/models/student')).default;
    const { Types } = require('mongoose');
    
    const user = await User.findById(userId).select('role').lean().exec();
    const isStudent = !user; // If not found in User collection, might be a student
    
    // Build filter
    const filter: any = {
      parent: parentId,
      'isDeleted.status': { $ne: true },
    };
    
    // If student, filter by their class and section
    if (isStudent) {
      const student = await Student.findById(userId)
        .select('courseClass section')
        .lean()
        .exec();
      
      if (student) {
        if (student.courseClass) {
          filter.courseClass = new Types.ObjectId(student.courseClass.toString());
        }
        if (student.section) {
          filter.section = new Types.ObjectId(student.section.toString());
        }
      }
    }
    
    // Find all folders where parent matches the parentId
    const subfolders = await Folder.find(filter)
      .populate('allowedUsers')
      .populate('files')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name')
      .sort({ createdAt: -1 });
    
    console.log('Backend found subfolders:', subfolders.length);
    
    res.status(200).json(subfolders);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
    console.error('Error while getting subfolders', err);
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.userId?.toString();
    
    // Perform soft delete
    await Folder.findByIdAndUpdate(id, {
      isDeleted: {
        status: true,
        deletedTime: new Date(),
        deletedBy: currentUserId,
      },
    });
    
    res.status(200).json({ message: 'Folder deleted successfully' });
  } catch (err) {
    res
      .status(400)
      .json({ err: err instanceof Error ? err.message : 'Unknown error' });
    console.error('Error while deleting folder', err);
  }
};


