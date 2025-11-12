import { Schema, Types, model } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser {
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'user' | 'superadmin';
  access: 'centre' | 'own' | 'all';
  collaboratingCentreId?: Types.ObjectId;
  isDeleted?: {
    deletedBy?: Types.ObjectId;
    deletedTime?: Date;
    status: boolean;
  };
}

// User Schema

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      maxLength: [20, 'Username must be less than 20 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      maxLength: [50, 'Email must be less than 50 characters'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ['admin', 'user', 'superadmin'],
        message: '{VALUE} is not supported',
      },
      default: 'user',
    },
    access: {
      type: String,
      required: [true, 'Access is required'],
      enum: {
        values: ['centre', 'own', 'all'],
        message: '{VALUE} is not supported',
      },
      default: 'centre',
      validate: {
        validator: function (this: IUser, access: string) {
          const role = this.role;

          // Superadmin can only have 'all' access
          if (role === 'superadmin') {
            return access === 'all';
          }

          // Admin can have 'all' or 'centre' access
          if (role === 'admin') {
            return access === 'all' || access === 'centre';
          }

          // User can have 'all', 'centre', or 'own' access
          if (role === 'user') {
            return access === 'all' || access === 'centre' || access === 'own';
          }

          return false;
        },
        message: function (this: IUser) {
          const role = this.role;
          if (role === 'superadmin') {
            return 'Superadmin role can only have "all" access';
          }
          if (role === 'admin') {
            return 'Admin role can only have "all" or "centre" access';
          }
          if (role === 'user') {
            return 'User role can have "all", "centre", or "own" access';
          }
          return 'Invalid access level for role';
        },
      },
    },
    collaboratingCentreId: {
      type: Schema.Types.ObjectId,
      ref: 'CollaboratingCentre',
      // required: function (this: IUser) {
      //   return this.role === 'user' || this.role === 'admin';
      // },
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

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.pre(/^find/, function (next) {
  const query = this as any;
  if (!query.getQuery().includeDeleted) {
    query.where({ 'isDeleted.status': { $ne: true } });
  }
  next();
});

export default model<IUser>('User', userSchema);
