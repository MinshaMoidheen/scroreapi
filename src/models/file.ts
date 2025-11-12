import { Schema, model, Types } from 'mongoose';

export interface IFile {
  filename: string;
  path: string;
  mimetype: string;
  size: number;
  folder: Types.ObjectId; // Parent folder
  owner: Types.ObjectId; // Uploaded by
  allowedUsers?: Types.ObjectId[]; // Users with access
  uploadedAt?: Date;
  isDeleted?: {
    deletedBy?: Types.ObjectId;
    deletedTime?: Date;
    status: boolean;
  };
}

const fileSchema = new Schema<IFile>({
  filename: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  folder: { type: Schema.Types.ObjectId, ref: 'Folder', required: true },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  allowedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  uploadedAt: { type: Date, default: Date.now },
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
});

fileSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

export default model<IFile>('File', fileSchema);
