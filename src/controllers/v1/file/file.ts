import File from '../../../models/file';
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import TeacherSession from '../../../models/teacherSession';
import { Types } from 'mongoose';

const UPLOAD_ABS_DIR = path.join(process.cwd(), 'uploads');

export const createFile = async (req: Request, res: Response) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUpload = Array.isArray(req.files.file)
      ? req.files.file[0]
      : req.files.file;
    const { folder, allowedUsers } = req.body;
    const owner = req.userId; // Get owner from authenticated user

    if (!folder) {
      return res.status(400).json({ error: 'Folder ID is required' });
    }

    if (!fs.existsSync(UPLOAD_ABS_DIR)) {
      fs.mkdirSync(UPLOAD_ABS_DIR, { recursive: true });
    }
    const uploadFilename = fileUpload.name;
    const absFilePath = path.join(UPLOAD_ABS_DIR, uploadFilename);
    const webFilePath = `/uploads/${uploadFilename}`; // always as /uploads/filename.ext
    await fileUpload.mv(absFilePath);
    const fileDoc = await File.create({
      filename: uploadFilename,
      path: webFilePath,
      mimetype: fileUpload.mimetype,
      size: fileUpload.size,
      folder,
      owner,
      allowedUsers: allowedUsers ? JSON.parse(allowedUsers) : [],
    });
    res.status(201).json(fileDoc);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: errorMessage });
  }
};

export const getFiles = async (req: Request, res: Response) => {
  try {
    const files = await File.find({})
      .populate('folder')
      .populate('owner')
      .populate('allowedUsers');
    res.status(200).json(files);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: errorMessage });
  }
};

export const getFilesByFolder = async (req: Request, res: Response) => {
  try {
    const { folderId } = req.params;
    
    if (!folderId) {
      return res.status(400).json({ error: 'Folder ID is required' });
    }

    const files = await File.find({ folder: folderId })
      .populate('folder')
      .populate('owner')
      .populate('allowedUsers')
      .sort({ createdAt: -1 });
    
    res.status(200).json(files);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: errorMessage });
  }
};

export const getFileById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const file = await File.findById(id)
      .populate('folder')
      .populate('owner')
      .populate('allowedUsers');
    if (!file) return res.status(404).json({ error: 'File not found' });

    // --- File access logging for teacher session with real info ---
    const userId = req.userId; // set by authenticate middleware
    if (userId) {
      // Safe extraction of username from owner
      let ownerUsername: string | undefined = undefined;
      if (
        file.owner &&
        typeof file.owner === 'object' &&
        'username' in file.owner
      ) {
        ownerUsername = (file.owner as any).username;
      }
      let folderId: string | undefined = undefined;
      let folderName: string | undefined = undefined;
      if (file.folder && typeof file.folder === 'object') {
        if ('_id' in file.folder) {
          folderId = (file.folder as any)._id.toString();
        }
        if ('folderName' in file.folder) {
          folderName = (file.folder as any).folderName;
        }
      }
      if (ownerUsername) {
        const session = await TeacherSession.findOne({
          username: ownerUsername,
          active: true,
        });
        if (session) {
          session.fileAccessLog.push({
            fileId: file._id.toString(),
            fileName: file.filename,
            folderId,
            folderName,
            accessedAt: new Date(),
          });
          session.lastActiveAt = new Date();
          await session.save();
        }
      }
    }
    // --- End logging ---

    res.status(200).json(file);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: errorMessage });
  }
};

export const updateFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates: any = {};
    if (req.body.filename) updates.filename = req.body.filename;
    if (req.body.allowedUsers) updates.allowedUsers = req.body.allowedUsers;

    if (req.files && req.files.file) {
      const fileUpload = Array.isArray(req.files.file)
        ? req.files.file[0]
        : req.files.file;
      if (!fs.existsSync(UPLOAD_ABS_DIR)) {
        fs.mkdirSync(UPLOAD_ABS_DIR, { recursive: true });
      }
      const uploadFilename = fileUpload.name;
      const absFilePath = path.join(UPLOAD_ABS_DIR, uploadFilename);
      const webFilePath = `/uploads/${uploadFilename}`; // always as /uploads/filename.ext
      await fileUpload.mv(absFilePath);
      updates.filename = uploadFilename;
      updates.path = webFilePath;
      updates.mimetype = fileUpload.mimetype;
      updates.size = fileUpload.size;
      // Remove old file from disk
      const oldFile = await File.findById(id);
      if (oldFile && oldFile.path) {
        const absOldPath = path.join(
          UPLOAD_ABS_DIR,
          path.basename(oldFile.path),
        );
        if (fs.existsSync(absOldPath)) {
          fs.unlinkSync(absOldPath);
        }
      }
    }
    const file = await File.findByIdAndUpdate(id, updates, { new: true });
    res.status(200).json(file);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: errorMessage });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.userId?.toString();
    
    // Perform soft delete
    await File.findByIdAndUpdate(id, {
      isDeleted: {
        status: true,
        deletedTime: new Date(),
        deletedBy: currentUserId,
      },
    });
    
    res.status(200).json({ message: 'File deleted successfully' });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: errorMessage });
  }
};

export const serveFile = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    console.log('Serving file:', filename);
    console.log('Request origin:', req.headers.origin);
    console.log('Request range:', req.headers.range);
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const filePath = path.join(process.cwd(), 'uploads', filename);
    console.log('File path:', filePath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log('File not found:', filePath);
      return res.status(404).json({ error: 'File not found' });
    }

    // Set comprehensive CORS headers
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Accept-Ranges');
    
    console.log('CORS headers set');
    
    // Set appropriate content type
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    console.log('Content-Type set to:', contentType);
    
    // Handle range requests for video files
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    
    if (req.headers.range) {
      const range = req.headers.range;
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      
      res.status(206);
      res.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.header('Accept-Ranges', 'bytes');
      res.header('Content-Length', chunksize.toString());
      
      console.log('Serving range request:', range, 'chunksize:', chunksize);
      
      file.pipe(res);
    } else {
      res.header('Content-Length', fileSize.toString());
      res.header('Accept-Ranges', 'bytes');
      console.log('Serving full file, size:', fileSize);
      
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Error serving file:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: errorMessage });
  }
};
