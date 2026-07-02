import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'owner' | 'admin' | 'technician';

export interface IUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDocument extends Omit<IUser, 'id'>, Document {
  /** Compare a plain password against the stored hash. */
  comparePassword(plain: string): Promise<boolean>;
  /** Full name convenience getter. */
  fullName: string;
}

const UserSchema = new Schema<UserDocument>(
  {
    firstName:    { type: String, required: true, trim: true },
    lastName:     { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role:         { type: String, enum: ['owner', 'admin', 'technician'], default: 'owner' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        delete (ret as any).passwordHash;   // never expose the hash
        return ret;
      },
    },
  }
);

// ─── Virtual ──────────────────────────────────────────────────────────────────
UserSchema.virtual('fullName').get(function (this: UserDocument) {
  return `${this.firstName} ${this.lastName}`;
});

// ─── Pre-save hook: hash password when it changes ────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// ─── Instance method ──────────────────────────────────────────────────────────
UserSchema.methods.comparePassword = async function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.passwordHash);
};

export const UserModel = model<UserDocument>('User', UserSchema);
