import { Schema, model, Types } from 'mongoose';

export interface ICourseClass {
  name: string;
  description?: string;
  isDeleted?: {
    deletedBy?: Types.ObjectId;
    deletedTime?: Date;
    status: boolean;
  };
}

const courseClassSchema = new Schema<ICourseClass>({
  name: { type: String, required: true },
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

courseClassSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

// Unique index that only applies to non-deleted records
courseClassSchema.index({ name: 1 }, {
  unique: true,
  partialFilterExpression: {
    $or: [
      { 'isDeleted.status': { $ne: true } },
      { 'isDeleted': { $exists: false } }
    ]
  }
});

export default model<ICourseClass>('CourseClass', courseClassSchema);
