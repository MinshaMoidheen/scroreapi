import { Schema, model, Types } from 'mongoose';

export interface ISection {
  name: string; // e.g. A, B etc
  courseClass?: Types.ObjectId;
  isDeleted?: {
    deletedBy?: Types.ObjectId;
    deletedTime?: Date;
    status: boolean;
  };
}

const sectionSchema = new Schema<ISection>({
  name: { type: String, required: true },
  courseClass: { type: Schema.Types.ObjectId, ref: 'CourseClass' },
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

sectionSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

// Unique index that only applies to non-deleted records
sectionSchema.index({ name: 1, courseClass: 1 }, {
  unique: true,
  partialFilterExpression: {
    $or: [
      { 'isDeleted.status': { $ne: true } },
      { 'isDeleted': { $exists: false } }
    ]
  }
});

export default model<ISection>('Section', sectionSchema);
