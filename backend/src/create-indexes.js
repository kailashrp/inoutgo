import 'dotenv/config';
import mongoose from 'mongoose';
import { Entry, DebitNote } from './models.js';

if (!process.env.MONGODB_URI) {
  console.error('Missing MONGODB_URI. Set the same database environment variables used by the API.');
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'test' });
  await Promise.all([Entry.createIndexes(), DebitNote.createIndexes()]);
  console.log('Ledger indexes created or verified successfully. No financial records were modified.');
} catch (error) {
  console.error('Could not create ledger indexes:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
