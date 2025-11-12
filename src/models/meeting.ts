import { Schema, model, Types } from 'mongoose';

export interface IMeeting {
  title: string;
  description?: string;
  date: Date;
  startTime: string; // e.g., "09:00"
  endTime: string; // e.g., "10:30"
  courseClass?: Types.ObjectId; // Reference to CourseClass
  section?: Types.ObjectId; // Reference to Section
  subject?: Types.ObjectId; // Reference to Subject
  organizer: Types.ObjectId; // Reference to User
  participants?: Types.ObjectId[]; // Array of User references
  isDeleted?: {
    deletedBy?: Types.ObjectId;
    deletedTime?: Date;
    status: boolean;
  };
}

const meetingSchema = new Schema<IMeeting>(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      maxLength: [200, 'Title must be less than 200 characters'],
    },
    description: {
      type: String,
      maxLength: [1000, 'Description must be less than 1000 characters'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format'],
    },
    courseClass: {
      type: Schema.Types.ObjectId,
      ref: 'CourseClass',
    },
    section: {
      type: Schema.Types.ObjectId,
      ref: 'Section',
    },
    subject: {
      type: Schema.Types.ObjectId,
      ref: 'Subject',
    },
    organizer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Organizer is required'],
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isDeleted: {
      type: {
        deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        deletedTime: { type: Date, default: null },
        status: { type: Boolean, default: false },
      },
      _id: false,
      select: false,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

meetingSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

export default model<IMeeting>('Meeting', meetingSchema);

