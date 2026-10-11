import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Entry, DebitNote } from './models.js';
import dotenv from "dotenv"
dotenv.config()

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!process.env.MONGODB_URI || !JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Missing MONGODB_URI or JWT_SECRET (use at least 32 random characters).'); process.exit(1);
}
app.set('trust proxy', 1);
app.use(helmet());
const origins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({ origin: (origin, cb) => (!origin || origins.includes('*') || origins.includes(origin)) ? cb(null, true) : cb(new Error('Origin not allowed by CORS')), credentials: false }));
app.use(express.json({ limit: '30kb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/signup', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

const safeUser = u => ({ id: u._id, username: u.username, role: u.role, mustChangePassword: u.mustChangePassword });
const auth = async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Please sign in.' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) return res.status(401).json({ message: 'Account unavailable.' });
    req.user = user; next();
  } catch { return res.status(401).json({ message: 'Session expired. Please sign in again.' }); }
};
const adminOnly = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ message: 'Admin access required.' });
const validAmount = amount => Number.isFinite(Number(amount)) && Number(amount) > 0 && Number(amount) <= 100000000000;
const validRemark = remark => typeof remark === 'string' && remark.trim().length > 0 && remark.trim().length <= 500;
const validDateRange = (from, to) => (!from || Number.isFinite(Date.parse(from))) && (!to || Number.isFinite(Date.parse(to)));


app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.post('/api/auth/signup', async (req, res) => {
  const username = String(req.body.username || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const password = String(req.body.password || '');
  if (!/^[A-Z0-9][A-Z0-9 _.-]{1,29}$/.test(username)) {
    return res.status(400).json({ message: 'Name must be 2–30 characters and may contain letters, numbers, spaces, dots, underscores or hyphens.' });
  }
  if (password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: 'Password must be 12–128 characters.' });
  }
  const count = await User.countDocuments();
  let role = 'user';
  if (count === 0) {
    if (username !== 'KAILASH') return res.status(400).json({ message: 'The first account must use the name KAILASH. It will become the administrator.' });
    role = 'admin';
  }
  const existing = await User.findOne({ username });
  if (existing) return res.status(409).json({ message: existing.active ? 'This name already has an account. Please sign in.' : 'This account is archived. Ask the administrator to restore it.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const created = await User.create({ username, passwordHash, role, mustChangePassword: false, active: true });
  res.status(201).json({ message: role === 'admin' ? 'Administrator account created. You can now sign in.' : 'Account created. You can now sign in.', user: safeUser(created) });
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toUpperCase();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ message: 'Name and password are required.' });
  const user = await User.findOne({ username }).select('+passwordHash');
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Incorrect name or password.' });
  const token = jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });
  res.json({ token, user: safeUser(user) });
});
app.post('/api/auth/change-password', auth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 12 || newPassword.length > 128) return res.status(400).json({ message: 'New password must be 12–128 characters.' });
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(400).json({ message: 'Current password is incorrect.' });
  user.passwordHash = await bcrypt.hash(newPassword, 12); user.mustChangePassword = false; await user.save();
  res.json({ message: 'Password updated successfully.', user: safeUser(user) });
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));

app.get('/api/entries', auth, async (req, res) => {
  const { from, to, kind, category, sort = 'newest', userId } = req.query;
  if (!validDateRange(from, to)) return res.status(400).json({ message: 'Invalid date filter.' });
  const filter = {};
  if (req.user.role === 'admin' && userId) filter.user = userId; else filter.user = req.user._id;
  if (from || to) filter.occurredAt = {}; if (from) filter.occurredAt.$gte = new Date(from); if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); filter.occurredAt.$lte = end; }
  if (['income', 'expense'].includes(kind)) filter.kind = kind;
  if (['normal', 'rental'].includes(category)) filter.category = category;
  const sortMap = { newest: { occurredAt: -1 }, oldest: { occurredAt: 1 }, 'low-high': { amount: 1 }, 'high-low': { amount: -1 }, person: { user: 1, occurredAt: -1 } };
  const entries = await Entry.find(filter).populate('user', 'username').sort(sortMap[sort] || sortMap.newest).limit(5000).lean();
  const normalized = entries.map(e => ({ ...e, id: e._id, username: e.user?.username || 'Unknown', user: e.user?._id }));
  if (sort === 'person') normalized.sort((a, b) => a.username.localeCompare(b.username) || new Date(b.occurredAt) - new Date(a.occurredAt));
  res.json({ entries: normalized });
});
app.post('/api/entries', auth, async (req, res) => {
  const { kind, category = 'normal', amount, remark } = req.body;
  if (!['income', 'expense'].includes(kind)) return res.status(400).json({ message: 'Choose income or expense.' });
  if (!['normal', 'rental'].includes(category)) return res.status(400).json({ message: 'Choose normal or rental.' });
  if (!validAmount(amount)) return res.status(400).json({ message: 'Enter a valid amount greater than zero.' });
  if (!validRemark(remark)) return res.status(400).json({ message: 'Remark is required (maximum 500 characters).' });
  const entry = await Entry.create({ user: req.user._id, kind, category, amount: Number(amount), remark: remark.trim(), occurredAt: new Date() });
  res.status(201).json({ message: 'Entry saved.', entry: { ...entry.toObject(), id: entry._id, username: req.user.username } });
});
app.patch('/api/entries/:id', auth, async (req, res) => {
  const entry = await Entry.findById(req.params.id);
  if (!entry) return res.status(404).json({ message: 'Entry not found.' });
  if (entry.user.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'You can edit only your own entries.' });
  if (Date.now() - entry.createdAt.getTime() > 60 * 60 * 1000) return res.status(403).json({ message: 'The one-hour edit window has expired. Create a debit note for settlement.' });
  const { kind, category, amount, remark } = req.body;
  if (!['income', 'expense'].includes(kind) || !['normal', 'rental'].includes(category) || !validAmount(amount) || !validRemark(remark)) return res.status(400).json({ message: 'Check entry type, category, amount and required remark.' });
  Object.assign(entry, { kind, category, amount: Number(amount), remark: remark.trim() }); await entry.save();
  res.json({ message: 'Entry updated.', entry: { ...entry.toObject(), id: entry._id, username: req.user.username } });
});
app.get('/api/debit-notes', auth, async (req, res) => {
  const filter = req.user.role === 'admin' && req.query.userId ? { user: req.query.userId } : { user: req.user._id };
  const notes = await DebitNote.find(filter).populate('user', 'username').populate('originalEntry', 'remark amount kind category occurredAt').sort({ occurredAt: -1 }).limit(5000).lean();
  res.json({ notes: notes.map(n => ({ ...n, id: n._id, username: n.user?.username || 'Unknown', user: n.user?._id })) });
});
app.post('/api/debit-notes', auth, async (req, res) => {
  const { originalEntryId = null, category, direction, amount, remark } = req.body;
  if (!['normal', 'rental'].includes(category) || !['debit', 'credit'].includes(direction) || !validAmount(amount) || !validRemark(remark)) return res.status(400).json({ message: 'Category, direction, valid amount and remark are required.' });
  let originalEntry = null;
  if (originalEntryId) {
    originalEntry = await Entry.findById(originalEntryId);
    if (!originalEntry) return res.status(404).json({ message: 'Original entry not found.' });
    if (req.user.role !== 'admin' && originalEntry.user.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'You cannot settle another user’s entry.' });
  }
  const note = await DebitNote.create({ user: originalEntry?.user || req.user._id, originalEntry: originalEntry?._id || null, category, direction, amount: Number(amount), remark: remark.trim(), occurredAt: new Date() });
  res.status(201).json({ message: 'Settlement note saved.', note: { ...note.toObject(), id: note._id, username: req.user.username } });
});

const totalsFor = async (userId = null) => {
  const entryMatch = userId ? { user: new mongoose.Types.ObjectId(userId) } : {};
  const noteMatch = userId ? { user: new mongoose.Types.ObjectId(userId) } : {};
  const [entryRows, noteRows] = await Promise.all([
    Entry.aggregate([{ $match: entryMatch }, { $group: { _id: { user: '$user', category: '$category', kind: '$kind' }, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    DebitNote.aggregate([{ $match: noteMatch }, { $group: { _id: { user: '$user', category: '$category', direction: '$direction' }, total: { $sum: '$amount' }, count: { $sum: 1 } } }])
  ]);
  const map = new Map();
  const get = (uid, category) => { const key = `${uid}:${category}`; if (!map.has(key)) map.set(key, { userId: uid, category, income: 0, expense: 0, debit: 0, credit: 0, entryCount: 0, noteCount: 0 }); return map.get(key); };
  for (const r of entryRows) { const x = get(String(r._id.user), r._id.category); x[r._id.kind] = r.total; x.entryCount += r.count; }
  for (const r of noteRows) { const x = get(String(r._id.user), r._id.category); x[r._id.direction] = r.total; x.noteCount += r.count; }
  return [...map.values()].map(x => ({ ...x, balance: x.income - x.expense - x.debit + x.credit }));
};
app.get('/api/summary', auth, async (req, res) => {
  const userId = req.user.role === 'admin' && req.query.userId ? req.query.userId : req.user._id.toString();
  const categories = await totalsFor(userId);
  res.json({ categories, total: categories.reduce((a, c) => a + c.balance, 0) });
});
app.post('/api/admin/users', auth, adminOnly, async (req, res) => {
  const username = String(req.body.username || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const password = String(req.body.password || '');
  if (!/^[A-Z0-9][A-Z0-9 _.-]{1,29}$/.test(username)) return res.status(400).json({ message: 'Enter a valid name (2–30 characters).' });
  if (username === 'KAILASH') return res.status(400).json({ message: 'The KAILASH administrator account cannot be replaced.' });
  if (password.length < 12 || password.length > 128) return res.status(400).json({ message: 'Temporary password must be 12–128 characters.' });
  const existing = await User.findOne({ username });
  const passwordHash = await bcrypt.hash(password, 12);
  if (existing) {
    if (existing.active) return res.status(409).json({ message: 'An active account with this name already exists.' });
    existing.passwordHash = passwordHash;
    existing.active = true;
    existing.role = 'user';
    existing.mustChangePassword = true;
    await existing.save();
    return res.status(200).json({ message: `${username} restored with a new temporary password.`, user: safeUser(existing) });
  }
  const created = await User.create({ username, passwordHash, role: 'user', mustChangePassword: true, active: true });
  res.status(201).json({ message: `${username} added. They must change the temporary password after signing in.`, user: safeUser(created) });
});
app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'User not found.' });
  if (target.role === 'admin' || target.username === 'KAILASH') return res.status(400).json({ message: 'The KAILASH administrator account cannot be removed.' });
  target.active = false;
  await target.save();
  res.json({ message: `${target.username} access removed. Historical financial records were preserved.` });
});
app.patch('/api/admin/users/:id/restore', auth, adminOnly, async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'User not found.' });
  if (target.role === 'admin' || target.username === 'KAILASH') return res.status(400).json({ message: 'Administrator account cannot be changed here.' });
  target.active = true;
  await target.save();
  res.json({ message: `${target.username} access restored. Their previous password remains active.` });
});

app.get('/api/admin/overview', auth, adminOnly, async (_req, res) => {
  const users = await User.find({}).select('username role active createdAt').sort({ username: 1 }).lean();
  const summaries = await totalsFor();
  const results = users.map(u => {
    const rows = summaries.filter(s => s.userId === String(u._id));
    const normal = rows.find(s => s.category === 'normal') || { income: 0, expense: 0, debit: 0, credit: 0, balance: 0, entryCount: 0, noteCount: 0 };
    const rental = rows.find(s => s.category === 'rental') || { income: 0, expense: 0, debit: 0, credit: 0, balance: 0, entryCount: 0, noteCount: 0 };
    return { id: u._id, username: u.username, role: u.role, active: u.active, normal, rental, totalEntries: normal.entryCount + rental.entryCount, totalNotes: normal.noteCount + rental.noteCount };
  });
  res.json({ users: results });
});
app.use((err, _req, res, _next) => { console.error(err.message); res.status(500).json({ message: 'Server error. Check backend logs.' }); });

mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'income_expense' }).then(() => {
  app.listen(PORT, () => console.log(`API running on port ${PORT}`));
}).catch(err => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
