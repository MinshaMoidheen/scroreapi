import Meeting from '../../../models/meeting';
import { Request, Response } from 'express';

export const createMeeting = async (req: Request, res: Response) => {
  try {
    const { title, description, date, startTime, endTime, courseClass, section, subject, participants } = req.body;
    const organizer = req.userId; // Get organizer from authenticated user

    if (!organizer) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const meeting = await Meeting.create({
      title,
      description,
      date,
      startTime,
      endTime,
      courseClass: courseClass || null,
      section: section || null,
      subject: subject || null,
      organizer,
      participants: participants || [],
    });

    const populatedMeeting = await Meeting.findById(meeting._id)
      .populate('organizer', 'username email')
      .populate('participants', 'username email')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name');

    res.status(201).json(populatedMeeting);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
    console.error('Error while creating meeting', err);
  }
};

export const getMeetings = async (req: Request, res: Response) => {
  try {
    const meetings = await Meeting.find()
      .populate('organizer', 'username email')
      .populate('participants', 'username email')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name')
      .sort({ date: -1, startTime: -1 });
    res.status(200).json(meetings);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const getMeetingById = async (req: Request, res: Response) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('organizer', 'username email')
      .populate('participants', 'username email')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name');
    
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.status(200).json(meeting);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const updateMeeting = async (req: Request, res: Response) => {
  try {
    const { title, description, date, startTime, endTime, courseClass, section, subject, participants } = req.body;
    
    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(date && { date }),
        ...(startTime && { startTime }),
        ...(endTime && { endTime }),
        ...(courseClass !== undefined && { courseClass: courseClass || null }),
        ...(section !== undefined && { section: section || null }),
        ...(subject !== undefined && { subject: subject || null }),
        ...(participants !== undefined && { participants }),
      },
      { new: true, runValidators: true },
    )
      .populate('organizer', 'username email')
      .populate('participants', 'username email')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name');

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.status(200).json(meeting);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const deleteMeeting = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId;
    const { Types } = await import('mongoose');
    
    // Perform soft delete
    await Meeting.findByIdAndUpdate(req.params.id, {
      $set: {
        'isDeleted.status': true,
        'isDeleted.deletedTime': new Date(),
        'isDeleted.deletedBy': currentUserId ? new Types.ObjectId(currentUserId.toString()) : null,
      },
    });
    
    res.status(200).json({ message: 'Meeting deleted successfully' });
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
};

export const getMyMeetings = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId;
    const { courseClass, section, subject } = req.query;

    console.log('Get My Meetings - Current User ID:', currentUserId);
    console.log('Query Params:', req.query);

    if (!currentUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Import Types for ObjectId conversion
    const { Types } = await import('mongoose');

    // Build query filter
    const filter: any = {
      'isDeleted.status': { $ne: true },
    };

    // Filter by participants - show meetings where the logged-in user is a participant
    // Also include meetings where the user is the organizer
    filter.$or = [
      { participants: { $in: [currentUserId] } }, // User is a participant (participants is an array)
      { organizer: currentUserId }                 // User is the organizer
    ];

    // Optionally filter by courseClass, section, subject if provided (convert to ObjectId)
    if (courseClass) {
      filter.courseClass = new Types.ObjectId(courseClass as string);
    }
    if (section) {
      filter.section = new Types.ObjectId(section as string);
    }
    if (subject) {
      filter.subject = new Types.ObjectId(subject as string);
    }

    console.log('My Meetings Filter:', JSON.stringify(filter, null, 2));
    console.log('Current User ID:', currentUserId.toString());

    const meetings = await Meeting.find(filter)
      .populate('organizer', 'username email')
      .populate('participants', 'username email')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name')
      .sort({ date: -1, startTime: -1 });

    console.log('Found meetings:', meetings.length);

    res.status(200).json(meetings);
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Unknown error' });
    console.error('Error while getting my meetings', err);
  }
};

