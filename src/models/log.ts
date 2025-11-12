import { Schema, Types, model } from 'mongoose';
import { getLogConnection } from '@/lib/mongoose';

export interface ILog {
  companyId: string;
  action: string;
  module: string;
  description: string;
  userRole: string;
  userId: Types.ObjectId;
  userEmail?: string;
  userName?: string;
  documentId?: Types.ObjectId;
  changes: {
    field: string;
    oldValue?: any;
    newValue?: any;
  }[];
  ip?: string;
  userAgent?: string;
  timestamp: Date;
}

const changeSchema = new Schema({
  field: {
    type: String,
    required: true
  },
  oldValue: {
    type: Schema.Types.Mixed,
    default: undefined
  },
  newValue: {
    type: Schema.Types.Mixed,
    default: undefined
  }
}, { _id: false });

const logSchema = new Schema<ILog>({
  companyId: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  module: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  userRole: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    index: true
  },
  userEmail: {
    type: String,
    default: null,
    index: true
  },
  userName: {
    type: String,
    default: null,
    index: true
  },
  documentId: {
    type: Schema.Types.ObjectId,
    default: null,
    index: true
  },
  changes: {
    type: [changeSchema],
    default: []
  } as any,
  ip: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false // We're using our own timestamp field
});

// Indexes for better query performance
logSchema.index({ companyId: 1, timestamp: -1 });
logSchema.index({ userId: 1, timestamp: -1 });
logSchema.index({ userEmail: 1, timestamp: -1 });
logSchema.index({ action: 1, module: 1, timestamp: -1 });
logSchema.index({ documentId: 1, timestamp: -1 });

// Use the separate logging database connection
const LogModel = () => {
  const logConnection = getLogConnection();
  return logConnection.model<ILog>('Log', logSchema);
};

export default LogModel;
