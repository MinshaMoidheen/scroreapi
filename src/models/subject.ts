import { Schema, model, Types } from 'mongoose';

export interface ISubject {
  name: string;
  code?: string;
  description?: string;
  isDeleted?: {
    deletedBy?: Types.ObjectId;
    deletedTime?: Date;
    status: boolean;
  };
}

const subjectSchema = new Schema<ISubject>({
  name: { type: String, required: true },
  code: { type: String },
  description: { type: String },
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

subjectSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

// Unique index that only applies to non-deleted records
subjectSchema.index({ name: 1 }, {
  unique: true,
  partialFilterExpression: {
    $or: [
      { 'isDeleted.status': { $ne: true } },
      { 'isDeleted': { $exists: false } }
    ]
  }
});

export default model<ISubject>('Subject', subjectSchema);
