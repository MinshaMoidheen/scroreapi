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
    console.log("req.query",req.query)
    
    // Import Types for ObjectId conversion
    const { Types } = require('mongoose');
    
    // Build filter from query parameters with ObjectId conversion
    const filter: any = {};
    if (courseClass) filter.courseClass = new Types.ObjectId(courseClass as string);
    if (subject) filter.subject = new Types.ObjectId(subject as string);
    if (section) filter.section = new Types.ObjectId(section as string);
    
    console.log('Final filter:', filter);
    
    // If no filter criteria, show all folders for debugging
    if (Object.keys(filter).length === 0) {
      console.log('No filter criteria - showing all folders');
    } else {
      console.log('Filter criteria applied - filtering folders');
    }
    
    // First, let's check if any folders exist without filtering
    const allFolders = await Folder.find({});
    console.log('All folders in DB:', allFolders.length);
    allFolders.forEach(f => {
      console.log('Folder:', {
        id: f._id,
        name: f.folderName,
        courseClass: f.courseClass,
        section: f.section,
        subject: f.subject
      });
    });
    
    const folders = await Folder.find(filter)
      .populate('parent')
      .populate('allowedUsers')
      .populate('files')
      .populate('courseClass')
      .populate('section')
      .populate('subject');
    
    console.log('Found folders:', folders.length);
    console.log('Folder details:', folders.map(f => ({
      id: f._id,
      name: f.folderName,
      courseClass: f.courseClass,
      section: f.section,
      subject: f.subject
    })));
    
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
    
    console.log('Backend getSubfolders received parentId:', parentId);
    
    // Find all folders where parent matches the parentId
    const subfolders = await Folder.find({ parent: parentId })
      .populate('allowedUsers')
      .populate('files')
      .populate('courseClass')
      .populate('section')
      .populate('subject');
    
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


