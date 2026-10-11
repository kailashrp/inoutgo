import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from './models.js';
import dotenv from "dotenv"
dotenv.config()

const names = ['GAJRAJ','SHANTA','RAJEEV','RADHA','ARVIND','INDU','KAILASH','NANDANI','JAINAM','ARADHIYA'];
const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env first.');
  const initialPassword = process.env.SEED_DEFAULT_PASSWORD;
  if (!initialPassword || initialPassword.length < 12 || initialPassword === 'ChangeThisNow123!') {
    throw new Error('Set SEED_DEFAULT_PASSWORD to your own temporary password (at least 12 characters) in backend/.env before seeding.');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash(initialPassword, 12);
  for (const username of names) {
    const existing = await User.findOne({ username });
    if (!existing) {
      await User.create({ username, passwordHash, role: username === 'KAILASH' ? 'admin' : 'user', mustChangePassword: true });
      console.log(`Created ${username} (${username === 'KAILASH' ? 'admin' : 'user'})`);
    } else {
      console.log(`Skipped existing account: ${username}`);
    }
  }
  console.log('\nInitial password was applied only to newly created accounts. Sign in and change every account password.');
  await mongoose.disconnect();
};
run().catch(async err => { console.error(err.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
