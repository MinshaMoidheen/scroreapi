import { Schema, model, Types } from 'mongoose';

export interface ISessionEvent {
  type: number;
  data: any;
  timestamp: number;
}

export interface ISection {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  events: ISessionEvent[];
}

export interface ITeacherSession {
  username: string;
  courseClassName: Types.ObjectId | string;
  sectionName: Types.ObjectId | string;
  subjectName: Types.ObjectId | string;
  sessionToken: string;
  deviceId?: string;
  loginAt: Date;
  logoutAt?: Date;
  active: boolean;
  fileAccessLog: Array<{
    fileId: string;
    fileName: string;
    folderId?: string;
    folderName?: string;
    accessedAt: Date;
    openedAt?: string; // File open time timestamp
    closedAt?: string; // File closing time timestamp
    duration?: number; // File open duration in milliseconds
    idleTime?: number; // Idle time for this file session
    activeTime?: number; // Active time for this file session
  }>;
  lastActiveAt: Date;
  // New fields for session tracking
  loginTime: Date;
  logoutTime?: Date;
  idleTime: number; // in milliseconds
  activeTime: number; // in milliseconds
  section: ISection[];
  isDeleted?: {
    deletedBy?: string;
    deletedTime?: Date;
    status: boolean;
  };
}

const teacherSessionSchema = new Schema<ITeacherSession>({
  username: { type: String, required: true },
  courseClassName: { type: Schema.Types.ObjectId, ref: 'CourseClass', required: true },
  sectionName: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
  subjectName: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  sessionToken: { type: String, required: true },
  deviceId: { type: String },
  loginAt: { type: Date, default: Date.now, required: true },
  logoutAt: { type: Date },
  active: { type: Boolean, default: true },
  lastActiveAt: { type: Date, default: Date.now },
  fileAccessLog: [
    {
      fileId: { type: String, required: true },
      fileName: { type: String, required: true },
      folderId: { type: String },
      folderName: { type: String },
      accessedAt: { type: Date, default: Date.now },
      openedAt: { type: String }, // File open time timestamp
      closedAt: { type: String }, // File closing time timestamp
      duration: { type: Number }, // File open duration in milliseconds
      idleTime: { type: Number }, // Idle time for this file session
      activeTime: { type: Number }, // Active time for this file session
    },
  ],
  // New fields for session tracking
  loginTime: { type: Date, default: Date.now, required: true },
  logoutTime: { type: Date },
  idleTime: { type: Number, default: 0 }, // in milliseconds
  activeTime: { type: Number, default: 0 }, // in milliseconds
  section: [
    {
      id: { type: String, required: true },
      startTime: { type: String, required: true },
      endTime: { type: String, required: true },
      duration: { type: Number, required: true },
      events: [
        {
          type: { type: Number, required: true },
          data: { type: Schema.Types.Mixed },
          timestamp: { type: Number, required: true },
        },
      ],
    },
  ],
  isDeleted: {
    type: {
      deletedBy: { type: String, default: null },
      deletedTime: { type: Date, default: null },
      status: { type: Boolean, default: false },
    },
    _id: false,
    select: false,
    default: {},
  },
});

teacherSessionSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

/**
 * Helpers and hooks to keep top-level activeTime/idleTime in sync with fileAccessLog.
 */
function sumTimesFromLogs(logs: Array<{ idleTime?: number; activeTime?: number }>): { idle: number; active: number } {
  const safeLogs = Array.isArray(logs) ? logs : [];
  const idle = safeLogs.reduce((acc, item) => acc + (item?.idleTime || 0), 0);
  const active = safeLogs.reduce((acc, item) => acc + (item?.activeTime || 0), 0);
  return { idle, active };
}

// Before saving a document (create or save), recompute sums from current fileAccessLog
teacherSessionSchema.pre('save', function (next) {
  const doc = this as any;
  const { idle, active } = sumTimesFromLogs(doc.fileAccessLog || []);
  doc.idleTime = idle;
  doc.activeTime = active;
  next();
});

// Before findOneAndUpdate, adjust top-level times based on how fileAccessLog is being modified
teacherSessionSchema.pre('findOneAndUpdate', function (next) {
  const query = this as any;
  const update = query.getUpdate() || {};

  // Normalize containers
  update.$set = update.$set || {};

  // Case 1: full replacement provided
  const fullReplaceLogs = update.fileAccessLog || update.$set.fileAccessLog;
  if (Array.isArray(fullReplaceLogs)) {
    const { idle, active } = sumTimesFromLogs(fullReplaceLogs);
    update.$set.idleTime = idle;
    update.$set.activeTime = active;
    query.setUpdate(update);
    return next();
  }

  // Case 2: pushing new entries -> increment the totals
  const pushOps = (update.$push && update.$push.fileAccessLog) ? update.$push.fileAccessLog : undefined;
  if (pushOps) {
    const items: any[] = Array.isArray(pushOps?.$each) ? pushOps.$each : [pushOps];
    const { idle, active } = sumTimesFromLogs(items as any[]);
    update.$inc = update.$inc || {};
    update.$inc.idleTime = (update.$inc.idleTime || 0) + idle;
    update.$inc.activeTime = (update.$inc.activeTime || 0) + active;
    query.setUpdate(update);
    return next();
  }

  // If fileAccessLog isn't being changed directly, do nothing here.
  return next();
});

export default model<ITeacherSession>('TeacherSession', teacherSessionSchema);
