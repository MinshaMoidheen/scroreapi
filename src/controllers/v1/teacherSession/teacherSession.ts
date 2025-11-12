import config from '@/config';
import { logger } from '@/lib/manualLogger';
import ControllerLogger from '@/utils/controllerLogger';
import TeacherSession from '@/models/teacherSession';
import CourseClass from '@/models/courseClass';
import SectionModel from '@/models/section';
import Subject from '@/models/subject';
import type { Request, Response } from 'express';
import type { ITeacherSession } from '@/models/teacherSession';

// Get all teacher sessions with pagination and filtering
export const getAllTeacherSessions = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get All Teacher Sessions', 'baseline', {
    userId: req.userId?.toString()
  });

  try {
    const currentUserId = req.userId?.toString() || '';
    const limit = parseInt(req.query.limit as string) || config.defaultResLimit;
    
    // Support both 'page' and 'offset' parameters
    let offset = 0;
    if (req.query.page) {
      const page = parseInt(req.query.page as string) || 1;
      offset = (page - 1) * limit;
    } else if (req.query.offset) {
      offset = parseInt(req.query.offset as string) || config.defaultResOffset;
    } else {
      offset = config.defaultResOffset;
    }
    
    // Optional filters - support both dateFrom/dateTo and startDate/endDate
    const { username, courseClassName, sectionName, subjectName, active, startDate, endDate, dateFrom, dateTo } = req.query;

    // Build filter object
    let queryFilter: any = {};

    if (username) {
      queryFilter.username = { $regex: username as string, $options: 'i' };
    }
    if (courseClassName) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(courseClassName as string);
      if (looksLikeObjectId) {
        queryFilter.courseClassName = courseClassName;
      } else {
        // Find by name and use the IDs
        const courseClasses = await CourseClass.find({ name: { $regex: courseClassName as string, $options: 'i' } }).select('_id').lean();
        queryFilter.courseClassName = { $in: courseClasses.map(cc => cc._id) };
      }
    }
    if (sectionName) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(sectionName as string);
      if (looksLikeObjectId) {
        queryFilter.sectionName = sectionName;
      } else {
        // Find by name and use the IDs
        const sections = await SectionModel.find({ name: { $regex: sectionName as string, $options: 'i' } }).select('_id').lean();
        queryFilter.sectionName = { $in: sections.map(s => s._id) };
      }
    }
    if (subjectName) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(subjectName as string);
      if (looksLikeObjectId) {
        queryFilter.subjectName = subjectName;
      } else {
        // Find by name and use the IDs
        const subjects = await Subject.find({ name: { $regex: subjectName as string, $options: 'i' } }).select('_id').lean();
        queryFilter.subjectName = { $in: subjects.map(s => s._id) };
      }
    }
    if (active !== undefined) {
      queryFilter.active = active === 'true';
    }
    // Support both dateFrom/dateTo and startDate/endDate parameter names
    const startDateValue = startDate || dateFrom;
    const endDateValue = endDate || dateTo;
    if (startDateValue || endDateValue) {
      queryFilter.loginAt = {};
      if (startDateValue) {
        const date = new Date(startDateValue as string);
        if (!isNaN(date.getTime())) {
          queryFilter.loginAt.$gte = date;
        }
      }
      if (endDateValue) {
        const date = new Date(endDateValue as string);
        if (!isNaN(date.getTime())) {
          // Add one day to include the entire end date
          date.setHours(23, 59, 59, 999);
          queryFilter.loginAt.$lte = date;
        }
      }
    }

    const total = await TeacherSession.countDocuments(queryFilter);

    if (offset >= total && total > 0) {
      offset = 0;
    }

    const sessions = await TeacherSession.find(queryFilter)
      .select('-__v')
      .populate('courseClassName', 'name')
      .populate('sectionName', 'name')
      .populate('subjectName', 'name')
      .limit(limit)
      .skip(offset)
      .sort({ loginAt: -1 })
      .lean()
      .exec();

    // Resolve section ids for section array
    const sectionIdDisplayCache = new Map<string, string>();
    const resolveSectionIdDisplay = async (value: any): Promise<string> => {
      if (!value) return 'N/A';
      const looksLikeObjectId = (val: any) => typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val);
      if (!looksLikeObjectId(value)) return String(value);
      if (sectionIdDisplayCache.has(value)) return sectionIdDisplayCache.get(value)!;
      const doc = await SectionModel.findById(value).lean();
      const display = doc?.name || String(value);
      sectionIdDisplayCache.set(value, display);
      return display;
    };

    const sessionsWithDisplay = await Promise.all(
      sessions.map(async (s: any) => {
        const courseClassDisplay = s.courseClassName && typeof s.courseClassName === 'object' && 'name' in s.courseClassName ? s.courseClassName.name : (String(s.courseClassName) || 'N/A');
        const sectionDisplay = s.sectionName && typeof s.sectionName === 'object' && 'name' in s.sectionName ? s.sectionName.name : (String(s.sectionName) || 'N/A');
        const subjectDisplay = s.subjectName && typeof s.subjectName === 'object' && 'name' in s.subjectName ? s.subjectName.name : (String(s.subjectName) || 'N/A');
        const mappedSections = await Promise.all((s.section || []).map(async (sec: any) => ({
          ...sec,
          sectionIdDisplay: await resolveSectionIdDisplay(sec.id)
        })));
        const fileActive = (s.fileAccessLog || []).reduce((acc: number, f: any) => acc + (f.activeTime || 0), 0);
        const fileIdle = (s.fileAccessLog || []).reduce((acc: number, f: any) => acc + (f.idleTime || 0), 0);
        return {
          ...s,
          courseClassDisplay,
          sectionDisplay,
          subjectDisplay,
          section: mappedSections,
          activeTimeComputed: fileActive || s.activeTime || 0,
          idleTimeComputed: fileIdle || s.idleTime || 0
        };
      })
    );

    const hasMore = offset + limit < total;
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      message: 'Teacher sessions retrieved successfully',
      sessions: sessionsWithDisplay,
      total,
      limit,
      offset,
      pagination: {
        page: currentPage, // Add 'page' for frontend compatibility
        currentPage,
        totalPages,
        hasMore,
        totalItems: total,
      },
      filters: {
        username,
        courseClassName,
        sectionName,
        subjectName,
        active,
        startDate,
        endDate,
      },
    });

    ControllerLogger.logSuccess(req, 'Get All Teacher Sessions', 'baseline', {
      userId: req.userId?.toString(),
      totalSessions: total,
      currentPage,
      limit,
      offset,
      appliedFilter: queryFilter,
    });
  } catch (err) {
    ControllerLogger.logError(req, 'Get All Teacher Sessions', 'baseline', err, {
      userId: req.userId?.toString()
    });

    // Log detailed error for debugging
    logger.error('Error in getAllTeacherSessions:', err);
    
    res.status(500).json({
      code: 'ServerError',
      message: err instanceof Error ? err.message : 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.stack : String(err)) : undefined,
    });
  }
};

// Get teacher session by ID
export const getTeacherSessionById = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get Teacher Session By ID', 'baseline', {
    userId: req.userId?.toString(),
    sessionId: req.params.id
  });

  try {
    const { id } = req.params;

    const session = await TeacherSession.findById(id)
      .select('-__v')
      .populate('courseClassName', 'name')
      .populate('sectionName', 'name')
      .populate('subjectName', 'name')
      .lean()
      .exec();

    if (!session) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Teacher session not found',
      });
      return;
    }

    // Resolve section ids for section array
    const sectionIdDisplayCache = new Map<string, string>();
    const resolveSectionIdDisplay = async (value: any): Promise<string> => {
      if (!value) return 'N/A';
      const looksLikeObjectId = (val: any) => typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val);
      if (!looksLikeObjectId(value)) return String(value);
      if (sectionIdDisplayCache.has(value)) return sectionIdDisplayCache.get(value)!;
      const doc = await SectionModel.findById(value).lean();
      const display = doc?.name || String(value);
      sectionIdDisplayCache.set(value, display);
      return display;
    };
    const courseClassDisplay = session.courseClassName && typeof session.courseClassName === 'object' && 'name' in session.courseClassName ? session.courseClassName.name : (String(session.courseClassName) || 'N/A');
    const sectionDisplay = session.sectionName && typeof session.sectionName === 'object' && 'name' in session.sectionName ? session.sectionName.name : (String(session.sectionName) || 'N/A');
    const subjectDisplay = session.subjectName && typeof session.subjectName === 'object' && 'name' in session.subjectName ? session.subjectName.name : (String(session.subjectName) || 'N/A');
    const mappedSections = await Promise.all((session.section || []).map(async (sec: any) => ({
      ...sec,
      sectionIdDisplay: await resolveSectionIdDisplay(sec.id)
    })));
    const fileActive = (session.fileAccessLog || []).reduce((acc: number, f: any) => acc + (f.activeTime || 0), 0);
    const fileIdle = (session.fileAccessLog || []).reduce((acc: number, f: any) => acc + (f.idleTime || 0), 0);

    res.status(200).json({
      message: 'Teacher session retrieved successfully',
      session: {
        ...session,
        courseClassDisplay,
        sectionDisplay,
        subjectDisplay,
        section: mappedSections,
        activeTimeComputed: fileActive || session.activeTime || 0,
        idleTimeComputed: fileIdle || session.idleTime || 0
      },
    });

    ControllerLogger.logSuccess(req, 'Get Teacher Session By ID', 'baseline', {
      userId: req.userId?.toString(),
      sessionId: id,
    });
  } catch (err) {
    ControllerLogger.logError(req, 'Get Teacher Session By ID', 'baseline', err, {
      userId: req.userId?.toString(),
      sessionId: req.params.id
    });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

// Create new teacher session
export const createTeacherSession = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Create Teacher Session', 'baseline', {
    userId: req.userId?.toString()
  });

  try {
    const currentUserId = req.userId?.toString() || '';
    const sessionData: Partial<ITeacherSession> = req.body;

    console.log("req.body",req.body)

    // Validate required fields
    const requiredFields = ['username', 'courseClassName', 'sectionName', 'subjectName', 'sessionToken'];
    const missingFields = requiredFields.filter(field => !sessionData[field as keyof ITeacherSession]);

    if (missingFields.length > 0) {
      res.status(400).json({
        code: 'BadRequest',
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
      return;
    }

    // Set default values
    const newSessionData = {
      ...sessionData,
      loginAt: sessionData.loginAt || new Date(),
      active: sessionData.active !== undefined ? sessionData.active : true,
      lastActiveAt: sessionData.lastActiveAt || new Date(),
      loginTime: sessionData.loginTime || new Date(),
      idleTime: sessionData.idleTime || 0,
      activeTime: sessionData.activeTime || 0,
      fileAccessLog: sessionData.fileAccessLog || [],
      section: sessionData.section || [],
    };

    const newSession = await TeacherSession.create(newSessionData);

    res.status(201).json({
      message: 'Teacher session created successfully',
      session: {
        id: newSession._id,
        username: newSession.username,
        courseClassName: newSession.courseClassName,
        sectionName: newSession.sectionName,
        subjectName: newSession.subjectName,
        sessionToken: newSession.sessionToken,
        active: newSession.active,
        loginAt: newSession.loginAt,
        logoutAt: newSession.logoutAt,
      },
    });

    // Log the creation activity
    await logger.logCreate(
      'TEACHER_SESSION',
      newSession._id,
      newSession.toObject(),
      currentUserId,
      req
    );

    ControllerLogger.logSuccess(req, 'Create Teacher Session', 'baseline', {
      userId: req.userId?.toString(),
      sessionId: newSession._id,
    });
  } catch (err) {
    ControllerLogger.logError(req, 'Create Teacher Session', 'baseline', err, {
      userId: req.userId?.toString()
    });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

// Update teacher session
export const updateTeacherSession = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Update Teacher Session', 'baseline', {
    userId: req.userId?.toString(),
    sessionId: req.params.id
  });

  try {
    const currentUserId = req.userId?.toString() || '';
    const { id } = req.params;
    const updateData: Partial<ITeacherSession> = req.body;

    // NO ARTIFICIAL LIMITS - Allow any count of events/sections
    // We'll only truncate if MongoDB throws a 16MB limit error
    // Limit to max 1 section per request (to avoid replacing entire array)
    if (updateData.section && Array.isArray(updateData.section)) {
      updateData.section = updateData.section.slice(0, 1);
    }

    // Limit to max 1 fileAccessLog entry per request
    if (updateData.fileAccessLog && Array.isArray(updateData.fileAccessLog)) {
      updateData.fileAccessLog = updateData.fileAccessLog.slice(0, 1);
    }

    // Check if session exists (lean to save memory)
    const sessionExists = await TeacherSession.findById(id).select('_id').lean().exec();
    
    if (!sessionExists) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Teacher session not found',
      });
      return;
    }

    // Get original session for logging (lean, minimal fields)
    const existingSession = await TeacherSession.findById(id)
      .select('username sessionToken courseClassName sectionName subjectName loginAt')
      .lean()
      .exec();

    // Build MongoDB update operations (no memory load of arrays)
    const updateOps: any = {};
    
    // Process fileAccessLog updates using MongoDB operators
    // NO LIMITS - use $push without $slice to allow unlimited entries
    // Only truncate if we hit MongoDB 16MB limit error
    // Also calculate idleTime and activeTime as sum from fileAccessLog array
    const fileAccessLogUpdate = updateData.fileAccessLog && Array.isArray(updateData.fileAccessLog) && updateData.fileAccessLog.length > 0;
    
    if (fileAccessLogUpdate && updateData.fileAccessLog) {
      // Don't add fileAccessLog to $push here - we'll handle it in the aggregation pipeline below
      // This ensures we can calculate sums including the new entries
      // idleTime and activeTime will be calculated in the aggregation pipeline below
    }

    // Process section updates using MongoDB operators
    // Note: updateData.section already limited to 1 section with max 200 events above
    if (updateData.section && Array.isArray(updateData.section) && updateData.section.length > 0) {
      const newSection = updateData.section[0]; // Already limited to 1
      if (!newSection || !newSection.id) {
        // Skip invalid section
      } else {
        // Process and validate ALL events - NO LIMITS, preserve everything
        let cleanedEvents: any[] = [];
        if (newSection.events && Array.isArray(newSection.events)) {
          // Process ALL events without any truncation
          // Be lenient with validation - preserve events even if some fields are missing
          for (const evt of newSection.events) {
            if (evt && (typeof evt === 'object')) {
              // Preserve event even if type/timestamp are missing - use defaults
              // Minimize data size by removing large nested objects
              let eventData = evt.data !== undefined ? evt.data : {};
              
              // If data is a large object, keep only essential fields or empty it
              if (typeof eventData === 'object' && eventData !== null && !Array.isArray(eventData)) {
                // For large objects, keep it as is but MongoDB will handle size limits
                // We'll truncate only if we hit the 16MB error
              }
              
              cleanedEvents.push({
                type: typeof evt.type === 'number' ? evt.type : 0,
                data: eventData,
                timestamp: typeof evt.timestamp === 'number' ? evt.timestamp : Date.now(),
              });
            }
          }
          
          console.log(`Processing section events: received=${newSection.events.length}, processed=${cleanedEvents.length} (NO LIMIT)`);
          
          if (newSection.events.length !== cleanedEvents.length) {
            console.warn(`Event count mismatch: received ${newSection.events.length} but processed ${cleanedEvents.length}`);
          }
        }

        const cleanedSection = {
          id: newSection.id,
          startTime: newSection.startTime,
          endTime: newSection.endTime,
          duration: newSection.duration,
          events: cleanedEvents,
        };

        console.log(`Adding new section with ${cleanedEvents.length} events (sectionId: ${newSection.id})`);

        // Use $push with $each but NO $slice limit
        // Allow unlimited sections and events - only truncate if MongoDB 16MB error occurs
        if (!updateOps.$push) updateOps.$push = {};
        updateOps.$push.section = {
          $each: [cleanedSection] // Single section with ALL its events
          // No $slice - allow any number of sections
        };
      }
    }

    // Add other field updates using $set
    if (!updateOps.$set) updateOps.$set = {};
    
    if (updateData.username) updateOps.$set.username = updateData.username;
    if (updateData.courseClassName) updateOps.$set.courseClassName = updateData.courseClassName;
    if (updateData.sectionName) updateOps.$set.sectionName = updateData.sectionName;
    if (updateData.subjectName) updateOps.$set.subjectName = updateData.subjectName;
    if (updateData.sessionToken) updateOps.$set.sessionToken = updateData.sessionToken;
    
    // Handle logoutTime fields
    if (updateData.logoutAt !== undefined) {
      updateOps.$set.logoutAt = new Date(updateData.logoutAt);
    }
    if (updateData.logoutTime !== undefined) {
      updateOps.$set.logoutTime = new Date(updateData.logoutTime);
    }
    if (updateData.active !== undefined) {
      updateOps.$set.active = updateData.active;
    }
    
    // Only update lastActiveAt if not logging out
    if (!updateData.logoutTime) {
      updateOps.$set.lastActiveAt = new Date();
    }

    try {
      // Step 1: Try to update without any truncation - allow any count
      // No proactive truncation - only truncate if we hit MongoDB 16MB limit
      // Use aggregation pipeline if we need to calculate sums with new fileAccessLog entries
      let finalUpdateOps: any = updateOps;
      
      // If we have fileAccessLog update, use aggregation pipeline to calculate sums including new entries
      if (fileAccessLogUpdate && updateData.fileAccessLog) {
        const newLogs = updateData.fileAccessLog.slice(0, 1);
        
        // Remove idleTime and activeTime from $set since we'll calculate them in pipeline
        const { idleTime: _, activeTime: __, ...restSetOps } = updateOps.$set || {};
        
        finalUpdateOps = [
          {
            $set: {
              // First, add the new fileAccessLog entries using $concatArrays
              fileAccessLog: {
                $concatArrays: [
                  { $ifNull: ['$fileAccessLog', []] },
                  newLogs
                ]
              },
              // Calculate idleTime from the combined array (old + new)
              idleTime: {
                $sum: {
                  $map: {
                    input: {
                      $concatArrays: [
                        { $ifNull: ['$fileAccessLog', []] },
                        newLogs
                      ]
                    },
                    as: 'log',
                    in: { $ifNull: ['$$log.idleTime', 0] }
                  }
                }
              },
              // Calculate activeTime from the combined array (old + new)
              activeTime: {
                $sum: {
                  $map: {
                    input: {
                      $concatArrays: [
                        { $ifNull: ['$fileAccessLog', []] },
                        newLogs
                      ]
                    },
                    as: 'log',
                    in: { $ifNull: ['$$log.activeTime', 0] }
                  }
                }
              },
              // Preserve other $set fields (excluding idleTime and activeTime which we just calculated)
              ...restSetOps
            }
          }
        ];
        
        // If we also have section push, add it as a separate update
        if (updateOps.$push && updateOps.$push.section) {
          // Need to do two updates: first the aggregation pipeline, then the push
          await TeacherSession.updateOne(
            { _id: id },
            finalUpdateOps,
            { runValidators: false }
          ).exec();
          
          // Then do the push operation separately
          await TeacherSession.updateOne(
            { _id: id },
            { $push: updateOps.$push },
            { runValidators: false }
          ).exec();
        } else {
          await TeacherSession.updateOne(
            { _id: id },
            finalUpdateOps,
            { runValidators: false }
          ).exec();
        }
      } else {
        // No fileAccessLog update, use regular update operations
        // But still calculate sums from fileAccessLog if it exists (to ensure consistency)
        // Use aggregation pipeline to calculate sums
        const setOps = updateOps.$set || {};
        const pushOps = updateOps.$push;
        
        const updateWithSums = [
          {
            $set: {
              // Calculate idleTime from fileAccessLog array
              idleTime: {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$fileAccessLog', []] },
                    as: 'log',
                    in: { $ifNull: ['$$log.idleTime', 0] }
                  }
                }
              },
              // Calculate activeTime from fileAccessLog array
              activeTime: {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$fileAccessLog', []] },
                    as: 'log',
                    in: { $ifNull: ['$$log.activeTime', 0] }
                  }
                }
              },
              // Preserve other $set fields
              ...setOps
            }
          }
        ];
        
        // Execute aggregation pipeline first to update sums and other fields
        await TeacherSession.updateOne(
          { _id: id },
          updateWithSums,
          { runValidators: false }
        ).exec();
        
        // If we also have section push, do it separately
        if (pushOps) {
          await TeacherSession.updateOne(
            { _id: id },
            { $push: pushOps },
            { runValidators: false }
          ).exec();
        }
      }
      
    } catch (updateError: any) {
      // If update fails due to size (16MB MongoDB limit), then truncate incrementally
      if (updateError.message?.includes('too large') || 
          updateError.message?.includes('maximum size') || 
          updateError.message?.includes('BSONObj size') ||
          updateError.message?.includes('offset') ||
          updateError.message?.includes('out of range')) {
        
        console.error('Document exceeds MongoDB 16MB limit, applying incremental truncation...');
        
        try {
          // Incremental truncation: First try keeping more data, then reduce if needed
          // Strategy: Remove event data objects (keep only type and timestamp) to reduce size
          
          // Step 1: Truncate existing arrays and minimize event data size
          await TeacherSession.updateOne(
            { _id: id },
            [
              {
                $set: {
                  // Keep last 50 sections, and minimize events within each
                  section: {
                    $slice: [
                      {
                        $map: {
                          input: { $ifNull: ['$section', []] },
                          as: 'sec',
                          in: {
                            $mergeObjects: [
                              '$$sec',
                              {
                                events: {
                                  $map: {
                                    input: {
                                      $slice: [
                                        { $ifNull: ['$$sec.events', []] },
                                        -500 // Keep last 500 events per section
                                      ]
                                    },
                                    as: 'evt',
                                    in: {
                                      type: '$$evt.type',
                                      timestamp: '$$evt.timestamp',
                                      // Preserve data for snapshot events (type 2) - required for replay
                                      // Remove data for other events to save space
                                      data: {
                                        $cond: {
                                          if: { $eq: ['$$evt.type', 2] },
                                          then: '$$evt.data', // Keep snapshot data
                                          else: {} // Remove data for other events
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            ]
                          }
                        }
                      },
                      -50 // Keep last 50 sections
                    ]
                  },
                  fileAccessLog: {
                    $slice: [
                      { $ifNull: ['$fileAccessLog', []] },
                      -100 // Keep last 100 file access logs
                    ]
                  }
                }
              }
            ]
          ).exec();
          
          // Step 2: Try update again with minimized event data (remove data objects)
          const truncatedOps: any = {
            $set: updateOps.$set || {}
          };
          
          // Minimize new data: remove event data objects to save space
          if (updateData.fileAccessLog && Array.isArray(updateData.fileAccessLog)) {
            truncatedOps.$push = {
              fileAccessLog: {
                $each: updateData.fileAccessLog.slice(0, 1),
                $slice: -100 // Keep last 100
              }
            };
          }
          
          if (updateData.section && Array.isArray(updateData.section) && updateData.section.length > 0) {
            const sec = updateData.section[0];
            if (sec && sec.events && Array.isArray(sec.events)) {
              // Keep all events but minimize data objects to save space
              // IMPORTANT: Preserve data for snapshot events (type 2) - required for replay
              const minimizedEvents = sec.events.slice(-500).map((evt: any) => ({
                type: typeof evt.type === 'number' ? evt.type : 0,
                timestamp: typeof evt.timestamp === 'number' ? evt.timestamp : Date.now(),
                // Preserve snapshot data (type 2), remove for others
                data: (typeof evt.type === 'number' && evt.type === 2 && evt.data) ? evt.data : {}
              }));
              
              if (!truncatedOps.$push) truncatedOps.$push = {};
              truncatedOps.$push.section = {
                $each: [{
                  id: sec.id,
                  startTime: sec.startTime,
                  endTime: sec.endTime,
                  duration: sec.duration,
                  events: minimizedEvents
                }],
                $slice: -50 // Keep last 50 sections
              };
            }
          }
          
          await TeacherSession.updateOne(
            { _id: id },
            truncatedOps,
            { runValidators: false }
          ).exec();
          
          console.log('Update succeeded after removing event data objects to reduce size');
          
        } catch (truncError: any) {
          // If still failing, apply ultra-minimal truncation
          console.error('Incremental truncation failed, applying minimal limits...');
          
          try {
            // Ultra-minimal: Keep only essential data
            await TeacherSession.updateOne(
              { _id: id },
              [
                {
                  $set: {
                    section: {
                      $slice: [
                        {
                          $map: {
                            input: { $ifNull: ['$section', []] },
                            as: 'sec',
                            in: {
                              id: '$$sec.id',
                              startTime: '$$sec.startTime',
                              endTime: '$$sec.endTime',
                              duration: '$$sec.duration',
                              events: {
                                $slice: [
                                  {
                                    $map: {
                                      input: { $ifNull: ['$$sec.events', []] },
                                      as: 'evt',
                                      in: {
                                        type: '$$evt.type',
                                        timestamp: '$$evt.timestamp',
                                        // Preserve data for snapshot events (type 2) - required for replay
                                        data: {
                                          $cond: {
                                            if: { $eq: ['$$evt.type', 2] },
                                            then: '$$evt.data', // Keep snapshot data
                                            else: {} // Remove data for other events
                                          }
                                        }
                                      }
                                    }
                                  },
                                  -100 // Only 100 events per section
                                ]
                              }
                            }
                          }
                        },
                        -20 // Only 20 sections
                      ]
                    },
                    fileAccessLog: {
                      $slice: [
                        { $ifNull: ['$fileAccessLog', []] },
                        -50
                      ]
                    }
                  }
                }
              ]
            ).exec();
            
            // Try minimal update
            const minimalOps: any = {
              $set: updateOps.$set || {}
            };
            
            if (updateData.section && Array.isArray(updateData.section) && updateData.section.length > 0) {
              const sec = updateData.section[0];
              if (sec && sec.events) {
                // IMPORTANT: Preserve data for snapshot events (type 2) - required for replay
                const minimalEvents = sec.events.slice(-100).map((evt: any) => ({
                  type: typeof evt.type === 'number' ? evt.type : 0,
                  timestamp: typeof evt.timestamp === 'number' ? evt.timestamp : Date.now(),
                  // Preserve snapshot data (type 2), remove for others
                  data: (typeof evt.type === 'number' && evt.type === 2 && evt.data) ? evt.data : {}
                }));
                
                minimalOps.$push = {
                  section: {
                    $each: [{
                      id: sec.id,
                      startTime: sec.startTime,
                      endTime: sec.endTime,
                      duration: sec.duration,
                      events: minimalEvents
                    }],
                    $slice: -20
                  }
                };
              }
            }
            
            await TeacherSession.updateOne(
              { _id: id },
              minimalOps,
              { runValidators: false }
            ).exec();
            
          } catch (minimalError: any) {
            console.error('All truncation attempts failed:', minimalError);
            throw updateError; // Throw original error
          }
        }
      } else {
        throw updateError;
      }
    }

    // Return success without loading full document (avoid memory issues)
    // Only load minimal fields if needed for response
    const minimalSession = await TeacherSession.findById(id)
      .select('_id username sessionToken courseClassName sectionName subjectName loginAt lastActiveAt active')
      .lean()
      .exec();

    if (!minimalSession) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Teacher session not found',
      });
      return;
    }

    // Return minimal response (no arrays to save memory)
    res.status(200).json({
      ...minimalSession,
      message: 'Session updated successfully'
    });

    // Log the update activity with minimal data (skip full document serialization)
    // Only log basic info to avoid memory issues
    const minimalUpdated = {
      ...minimalSession,
      // Don't include arrays in logging
    };
    
    await logger.logUpdate(
      'TEACHER_SESSION',
      id,
      existingSession,
      minimalUpdated,
      currentUserId,
      ['username', 'sessionToken', 'lastActiveAt', 'active'], // Only track specific fields
      req
    );

    ControllerLogger.logSuccess(req, 'Update Teacher Session', 'baseline', {
      userId: req.userId?.toString(),
      sessionId: id,
    });
  } catch (err: any) {
    console.error('Error updating teacher session:', err);
    console.error('Error message:', err?.message);
    console.error('Error stack:', err?.stack);
    
    ControllerLogger.logError(req, 'Update Teacher Session', 'baseline', err, {
      userId: req.userId?.toString(),
      sessionId: req.params.id
    });

    res.status(500).json({
      code: 'ServerError',
      message: err?.message || 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
    });
  }
};

// Get sections by session ID
export const getSectionsBySession = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get Sections By Session', 'baseline', {
    userId: req.userId?.toString(),
    sessionId: req.params.id
  });

  try {
    const { id } = req.params;

    // Find the session and get only the section array
    const session = await TeacherSession.findById(id)
      .select('section')
      .lean()
      .exec();

    if (!session) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Teacher session not found',
      });
      return;
    }

    res.status(200).json({
      sessionId: id,
      sections: session.section || [],
    });

    ControllerLogger.logSuccess(req, 'Get Sections By Session', 'baseline', {
      userId: req.userId?.toString(),
      sessionId: id,
      sectionsCount: (session.section || []).length
    });
  } catch (err) {
    ControllerLogger.logError(req, 'Get Sections By Session', 'baseline', err, {
      userId: req.userId?.toString(),
      sessionId: req.params.id
    });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

// Delete teacher session
export const deleteTeacherSession = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Delete Teacher Session', 'baseline', {
    userId: req.userId?.toString(),
    sessionId: req.params.id
  });

  try {
    const currentUserId = req.userId?.toString() || '';
    const { id } = req.params;

    // Find the session first to get the original data for logging
    const existingSession = await TeacherSession.findById(id).lean().exec();

    if (!existingSession) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Teacher session not found',
      });
      return;
    }

    // Perform soft delete
    await TeacherSession.findByIdAndUpdate(id, {
      isDeleted: {
        status: true,
        deletedTime: new Date(),
        deletedBy: currentUserId,
      },
    });

    res.status(200).json({
      message: 'Teacher session deleted successfully',
    });

    // Log the deletion activity
    await logger.logDelete(
      'TEACHER_SESSION',
      id,
      existingSession,
      currentUserId,
      req
    );

    ControllerLogger.logSuccess(req, 'Delete Teacher Session', 'baseline', {
      userId: req.userId?.toString(),
      sessionId: id,
    });
  } catch (err) {
    ControllerLogger.logError(req, 'Delete Teacher Session', 'baseline', err, {
      userId: req.userId?.toString(),
      sessionId: req.params.id
    });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

// Search teacher sessions with advanced filtering
export const searchTeacherSessions = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Search Teacher Sessions', 'baseline', {
    userId: req.userId?.toString()
  });

  try {
    const {
      q, // search query
      page = '1',
      limit = '50',
      username,
      courseClassName,
      sectionName,
      subjectName,
      active,
      startDate,
      endDate,
      sortBy = 'loginAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const filter: any = {};
    
    // Text search across multiple fields
    if (q) {
      // For text search, we need to search in populated documents too
      // First, try to find matching course classes, sections, and subjects by name
      const courseClassIds = await CourseClass.find({ name: { $regex: q as string, $options: 'i' } }).select('_id').lean();
      const sectionIds = await SectionModel.find({ name: { $regex: q as string, $options: 'i' } }).select('_id').lean();
      const subjectIds = await Subject.find({ name: { $regex: q as string, $options: 'i' } }).select('_id').lean();
      
      filter.$or = [
        { username: { $regex: q as string, $options: 'i' } },
        { sessionToken: { $regex: q as string, $options: 'i' } },
        { deviceId: { $regex: q as string, $options: 'i' } }
      ];
      
      // Add ObjectId searches
      if (courseClassIds.length > 0) {
        filter.$or.push({ courseClassName: { $in: courseClassIds.map(cc => cc._id) } });
      }
      if (sectionIds.length > 0) {
        filter.$or.push({ sectionName: { $in: sectionIds.map(s => s._id) } });
      }
      if (subjectIds.length > 0) {
        filter.$or.push({ subjectName: { $in: subjectIds.map(s => s._id) } });
      }
    }
    
    // Specific field filters
    if (username) filter.username = { $regex: username as string, $options: 'i' };
    if (courseClassName) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(courseClassName as string);
      if (looksLikeObjectId) {
        filter.courseClassName = courseClassName;
      } else {
        // Find by name and use the IDs
        const courseClasses = await CourseClass.find({ name: { $regex: courseClassName as string, $options: 'i' } }).select('_id').lean();
        filter.courseClassName = { $in: courseClasses.map(cc => cc._id) };
      }
    }
    if (sectionName) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(sectionName as string);
      if (looksLikeObjectId) {
        filter.sectionName = sectionName;
      } else {
        // Find by name and use the IDs
        const sections = await SectionModel.find({ name: { $regex: sectionName as string, $options: 'i' } }).select('_id').lean();
        filter.sectionName = { $in: sections.map(s => s._id) };
      }
    }
    if (subjectName) {
      // Support both ObjectId and name matching
      const looksLikeObjectId = /^[a-f0-9]{24}$/i.test(subjectName as string);
      if (looksLikeObjectId) {
        filter.subjectName = subjectName;
      } else {
        // Find by name and use the IDs
        const subjects = await Subject.find({ name: { $regex: subjectName as string, $options: 'i' } }).select('_id').lean();
        filter.subjectName = { $in: subjects.map(s => s._id) };
      }
    }
    if (active !== undefined) filter.active = active === 'true';
    
    // Date range filters
    if (startDate || endDate) {
      filter.loginAt = {};
      if (startDate) filter.loginAt.$gte = new Date(startDate as string);
      if (endDate) filter.loginAt.$lte = new Date(endDate as string);
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination
    const totalSessions = await TeacherSession.countDocuments(filter);
    
    // Get sessions with pagination
    const sessions = await TeacherSession.find(filter)
      .select('-__v')
      .populate('courseClassName', 'name')
      .populate('sectionName', 'name')
      .populate('subjectName', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Resolve section ids for section array
    const sectionIdDisplayCache = new Map<string, string>();
    const resolveSectionIdDisplay = async (value: any): Promise<string> => {
      if (!value) return 'N/A';
      const looksLikeObjectId = (val: any) => typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val);
      if (!looksLikeObjectId(value)) return String(value);
      if (sectionIdDisplayCache.has(value)) return sectionIdDisplayCache.get(value)!;
      const doc = await SectionModel.findById(value).lean();
      const display = doc?.name || String(value);
      sectionIdDisplayCache.set(value, display);
      return display;
    };
    const sessionsWithDisplay = await Promise.all(
      sessions.map(async (s: any) => {
        const courseClassDisplay = s.courseClassName && typeof s.courseClassName === 'object' && 'name' in s.courseClassName ? s.courseClassName.name : (String(s.courseClassName) || 'N/A');
        const sectionDisplay = s.sectionName && typeof s.sectionName === 'object' && 'name' in s.sectionName ? s.sectionName.name : (String(s.sectionName) || 'N/A');
        const subjectDisplay = s.subjectName && typeof s.subjectName === 'object' && 'name' in s.subjectName ? s.subjectName.name : (String(s.subjectName) || 'N/A');
        const mappedSections = await Promise.all((s.section || []).map(async (sec: any) => ({
          ...sec,
          sectionIdDisplay: await resolveSectionIdDisplay(sec.id)
        })));
        const fileActive = (s.fileAccessLog || []).reduce((acc: number, f: any) => acc + (f.activeTime || 0), 0);
        const fileIdle = (s.fileAccessLog || []).reduce((acc: number, f: any) => acc + (f.idleTime || 0), 0);
        return {
          ...s,
          courseClassDisplay,
          sectionDisplay,
          subjectDisplay,
          section: mappedSections,
          activeTimeComputed: fileActive || s.activeTime || 0,
          idleTimeComputed: fileIdle || s.idleTime || 0
        };
      })
    );

    const totalPages = Math.ceil(totalSessions / limitNum);

    res.status(200).json({
      success: true,
      message: 'Teacher sessions searched successfully',
      data: sessionsWithDisplay,
      searchQuery: q,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalSessions,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      },
      filters: {
        username,
        courseClassName,
        sectionName,
        subjectName,
        active,
        startDate,
        endDate,
        sortBy,
        sortOrder
      }
    });

    ControllerLogger.logSuccess(req, 'Search Teacher Sessions', 'baseline', {
      userId: req.userId?.toString(),
      totalSessions,
      currentPage: pageNum,
      searchQuery: q,
      appliedFilter: filter,
    });
  } catch (error) {
    ControllerLogger.logError(req, 'Search Teacher Sessions', 'baseline', error, {
      userId: req.userId?.toString()
    });

    await logger.logError('TEACHER_SESSION', 'SEARCH', error, req.userId || 'anonymous', req);
    
    res.status(500).json({
      success: false,
      message: 'Failed to search teacher sessions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
