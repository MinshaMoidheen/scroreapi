import { Schema, model } from 'mongoose';
import { Types } from 'mongoose';

export interface IFolder {
  folderName: string;
  parent?: Types.ObjectId | null; // Reference to parent folder for subfolders
  files?: Types.ObjectId[]; // References to files in this folder
  allowedUsers?: Types.ObjectId[]; // Users with access
  courseClass?: Types.ObjectId;
  section?: Types.ObjectId;
  subject?: Types.ObjectId;
  isDeleted?: {
    deletedBy?: Types.ObjectId;
    deletedTime?: Date;
    status: boolean;
  };
}

const folderSchema = new Schema<IFolder>(
  {
    folderName: {
      type: String,
      required: [true, 'Folder Name is required'],
      trim: true,
      maxlength: [100, 'Folder Name cannot exceed 100 characters'],
      uppercase: true,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
    },
    files: [
      {
        type: Schema.Types.ObjectId,
        ref: 'File',
      },
    ],
    allowedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    courseClass: {
      type: Schema.Types.ObjectId,
      ref: 'CourseClass',
      required: false,
    },
    section: {
      type: Schema.Types.ObjectId,
      ref: 'Section',
      required: false,
    },
    subject: {
      type: Schema.Types.ObjectId,
      ref: 'Subject',
      required: false,
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

folderSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

export default model<IFolder>('Folder', folderSchema);
