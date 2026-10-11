import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, uppercase: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  mustChangePassword: { type: Boolean, default: true },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const entrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, enum: ['normal', 'rental'], default: 'normal', required: true },
  amount: { type: Number, required: true, min: 0.01 },
  remark: { type: String, required: true, trim: true, maxlength: 500 },
  occurredAt: { type: Date, default: Date.now, required: true }
}, { timestamps: true });
entrySchema.index({ occurredAt: -1 });

const debitNoteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'Entry', default: null },
  category: { type: String, enum: ['normal', 'rental'], required: true },
  direction: { type: String, enum: ['debit', 'credit'], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  remark: { type: String, required: true, trim: true, maxlength: 500 },
  occurredAt: { type: Date, default: Date.now, required: true }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
export const Entry = mongoose.model('Entry', entrySchema);
export const DebitNote = mongoose.model('DebitNote', debitNoteSchema);
