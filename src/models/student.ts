import { Schema, Types, model } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IStudent {
  username: string;
  password: string;
  courseClass: Types.ObjectId;
  section: Types.ObjectId;
  rollNumber: string;
  role?: string;
  isDeleted?: {
    deletedBy?: Types.ObjectId;
    deletedTime?: Date;
    status: boolean;
  };
}

const studentSchema = new Schema<IStudent>(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      maxLength: [50, 'Username must be less than 50 characters'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    courseClass: {
      type: Schema.Types.ObjectId,
      ref: 'CourseClass',
      required: [true, 'Course class is required'],
    },
    section: {
      type: Schema.Types.ObjectId,
      ref: 'Section',
      required: [true, 'Section is required'],
    },
    rollNumber: {
      type: String,
      required: [true, 'Roll number is required'],
      maxLength: [20, 'Roll number must be less than 20 characters'],
    },
    role: {
      type: String,
      default: 'student',
      enum: ['student'],
    },
    isDeleted: {
      type: {
        deletedBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        deletedTime: {
          type: Date,
          default: null,
        },
        status: {
          type: Boolean,
          default: false,
        },
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

// Hash password before saving
studentSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Soft delete middleware
studentSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

// Unique index for rollNumber within a section (only for non-deleted records)
studentSchema.index({ rollNumber: 1, section: 1 }, {
  unique: true,
  partialFilterExpression: {
    $or: [
      { 'isDeleted.status': { $ne: true } },
      { 'isDeleted': { $exists: false } }
    ]
  }
});

export default model<IStudent>('Student', studentSchema);

