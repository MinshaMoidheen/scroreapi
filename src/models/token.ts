import { Schema, model, Types } from 'mongoose';

interface IToken {
  token: string;
  userId: Types.ObjectId;
  isDeleted?: {
    deletedBy?: Types.ObjectId;
    deletedTime?: Date;
    status: boolean;
  };
}

const tokenSchema = new Schema<IToken>(
  {
    token: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
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

tokenSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

export default model<IToken>('Token', tokenSchema);
