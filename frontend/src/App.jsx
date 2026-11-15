import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, Clock3, Download, FileSpreadsheet, FileText, Filter, Home, LogOut, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Wallet, X, Pencil, ReceiptText, Users, LockKeyhole } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n || 0));
const dateTime = value => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const blankForm = { kind: 'income', category: 'normal', amount: '', remark: '' };

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ledger_token') || '');
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('ledger_user') || 'null'); } catch { return null; } });
  const [loginName, setLoginName] = useState(''); const [loginPassword, setLoginPassword] = useState(''); const [authMode, setAuthMode] = useState('login'); const [signupName, setSignupName] = useState(''); const [signupPassword, setSignupPassword] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false); const [newUserForm, setNewUserForm] = useState({ username: '', password: '' });
  const [page, setPage] = useState('overview'); const [summary, setSummary] = useState({ categories: [], total: 0, mainBalance: 0 });
  const [entries, setEntries] = useState([]); const [notes, setNotes] = useState([]); const [adminUsers, setAdminUsers] = useState([]);
  const [toast, setToast] = useState(null); const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false); const [form, setForm] = useState(blankForm); const [editing, setEditing] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false); const [noteForm, setNoteForm] = useState({ originalEntryId: '', category: 'normal', direction: 'debit', amount: '', remark: '' });
  const [passwordOpen, setPasswordOpen] = useState(false); const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [filters, setFilters] = useState({ kind: 'all', category: 'all', sort: 'newest', from: '', to: '', search: '', userId: '' });
  const [reportOpen, setReportOpen] = useState(false);
  const [quickDownloadPeriod, setQuickDownloadPeriod] = useState('');
  const [quickAutoDownload, setQuickAutoDownload] = useState('');
  const [presetName, setPresetName] = useState('');
  const [savedPresets, setSavedPresets] = useState(() => { try { return JSON.parse(localStorage.getItem(`ledger_presets_${JSON.parse(localStorage.getItem('ledger_user') || 'null')?.id || 'guest'}`) || '[]'); } catch { return []; } });
  const [reportConfig, setReportConfig] = useState({ period: 'month', from: '', to: '', financialYear: '', userId: '', category: 'all', format: 'excel', preview: true });
  const [reportEntries, setReportEntries] = useState([]); const [reportNotes, setReportNotes] = useState([]); const [reportLoading, setReportLoading] = useState(false);

  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.setTimeout(() => setToast(null), 3000); }, []);
  // Clear the complete authenticated UI state in one place. This also closes
  // any report/modal left open when a user signs out or their session expires.
  const logout = useCallback((show = true) => {
    try { localStorage.removeItem('ledger_token'); localStorage.removeItem('ledger_user'); } catch {}
    setToken('');
    setUser(null);
    setPage('overview');
    setEntries([]);
    setNotes([]);
    setAdminUsers([]);
    setSummary({ categories: [], total: 0, mainBalance: 0 });
    setReportEntries([]);
    setReportNotes([]);
    setReportOpen(false);
    setQuickDownloadPeriod('');
    setQuickAutoDownload('');
    setFormOpen(false);
    setNoteOpen(false);
    setUserModalOpen(false);
    setPasswordOpen(false);
    setBusy(false);
    setAuthMode('login');
    if (show) notify('Signed out.');
  }, [notify]);
  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status === 401 && token) logout(false); throw new Error(data.message || 'Request failed.'); }
    return data;
  }, [token, logout]);

  const loadData = useCallback(async () => {
    if (!token || !user) return;
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from); if (filters.to) params.set('to', filters.to);
      if (filters.kind !== 'all') params.set('kind', filters.kind); if (filters.category !== 'all') params.set('category', filters.category);
      params.set('sort', filters.sort); if (user.role === 'admin' && filters.userId) params.set('userId', filters.userId);
      const [e, s, n] = await Promise.all([request(`/entries?${params}`), request(`/summary${user.role === 'admin' && filters.userId ? `?userId=${encodeURIComponent(filters.userId)}` : ''}`), request(`/debit-notes${user.role === 'admin' && filters.userId ? `?userId=${encodeURIComponent(filters.userId)}` : ''}`)]);
      setEntries(e.entries || []); setSummary(s); setNotes(n.notes || []);
      if (user.role === 'admin') { const a = await request('/admin/overview'); setAdminUsers(a.users || []); }
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }, [token, user, filters.from, filters.to, filters.kind, filters.category, filters.sort, filters.userId, request, notify]);
  const initialFilterLoad = useRef(false);
  const loadEntriesOnly = useCallback(async () => {
    if (!token || !user) return;
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from); if (filters.to) params.set('to', filters.to);
    if (filters.kind !== 'all') params.set('kind', filters.kind); if (filters.category !== 'all') params.set('category', filters.category);
    params.set('sort', filters.sort); if (user.role === 'admin' && filters.userId) params.set('userId', filters.userId);
    try {
      const data = await request(`/entries?${params}`);
      setEntries(data.entries || []);
    } catch (err) { notify(err.message, 'error'); }
  }, [token, user, filters.from, filters.to, filters.kind, filters.category, filters.sort, filters.userId, request, notify]);
  useEffect(() => {
    if (token && user) loadData();
    else initialFilterLoad.current = false;
  }, [token, user?.id]);
  useEffect(() => {
    if (!token || !user) { initialFilterLoad.current = false; return; }
    if (!initialFilterLoad.current) { initialFilterLoad.current = true; return; }
    loadEntriesOnly();
  }, [token, user?.id, filters.from, filters.to, filters.kind, filters.category, filters.sort, filters.userId, loadEntriesOnly]);

  const login = async e => {
    e.preventDefault(); setBusy(true);
    try { const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username: loginName, password: loginPassword }) }); localStorage.setItem('ledger_token', data.token); localStorage.setItem('ledger_user', JSON.stringify(data.user)); setToken(data.token); setUser(data.user); setLoginPassword(''); setPage('overview'); if (data.user.mustChangePassword) setPasswordOpen(true); notify(`Welcome, ${data.user.username}.`); }
    catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };
  const signup = async e => {
    e.preventDefault(); setBusy(true);
    try {
      const data = await request('/auth/signup', { method: 'POST', body: JSON.stringify({ username: signupName.trim().toUpperCase(), password: signupPassword }) });
      setLoginName(signupName.trim().toUpperCase()); setLoginPassword(''); setSignupName(''); setSignupPassword(''); setAuthMode('login'); notify(data.message);
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };
  const createUser = async e => {
    e.preventDefault();
    try {
      const data = await request('/admin/users', { method: 'POST', body: JSON.stringify({ username: newUserForm.username.trim().toUpperCase(), password: newUserForm.password }) });
      setUserModalOpen(false); setNewUserForm({ username: '', password: '' }); notify(data.message); loadData();
    } catch (err) { notify(err.message, 'error'); }
  };
  const archiveUser = async target => {
    if (!window.confirm(`Remove login access for ${target.username}? Their historical entries will be preserved.`)) return;
    try { const data = await request(`/admin/users/${target.id}`, { method: 'DELETE' }); notify(data.message); loadData(); }
    catch (err) { notify(err.message, 'error'); }
  };
  const restoreUser = async target => {
    try { const data = await request(`/admin/users/${target.id}/restore`, { method: 'PATCH' }); notify(data.message); loadData(); }
    catch (err) { notify(err.message, 'error'); }
  };
  const changePassword = async e => {
    e.preventDefault();
    if (pwForm.newPassword.length < 12) return notify('Use at least 12 characters for your new password.', 'error');
    if (pwForm.newPassword !== pwForm.confirmPassword) return notify('New passwords do not match.', 'error');
    try { const data = await request('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }) }); const next = data.user; setUser(next); localStorage.setItem('ledger_user', JSON.stringify(next)); setPasswordOpen(false); setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); notify(data.message); }
    catch (err) { notify(err.message, 'error'); }
  };
  const openAdd = () => { setEditing(null); setForm(blankForm); setFormOpen(true); };
  const openEdit = entry => {
    if (entry.username !== user.username) return notify('You can edit only your own entries.', 'error');
    if (Date.now() - new Date(entry.createdAt).getTime() > 3600000) return notify('One-hour edit window expired. Create a debit note.', 'error');
    setEditing(entry); setForm({ kind: entry.kind, category: entry.category, amount: String(entry.amount), remark: entry.remark }); setFormOpen(true);
  };
  const saveEntry = async e => {
    e.preventDefault();
    if (!form.remark.trim()) return notify('Remark is compulsory.', 'error');
    const body = { ...form, amount: Number(form.amount) };
    try { const data = await request(editing ? `/entries/${editing.id || editing._id}` : '/entries', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) }); setFormOpen(false); setForm(blankForm); setEditing(null); notify(data.message); loadData(); }
    catch (err) { notify(err.message, 'error'); }
  };
  const saveNote = async e => {
    e.preventDefault(); if (!noteForm.remark.trim()) return notify('Settlement remark is compulsory.', 'error');
    try { const data = await request('/debit-notes', { method: 'POST', body: JSON.stringify({ ...noteForm, originalEntryId: noteForm.originalEntryId || null, amount: Number(noteForm.amount) }) }); setNoteOpen(false); setNoteForm({ originalEntryId: '', category: 'normal', direction: 'debit', amount: '', remark: '' }); notify(data.message); loadData(); }
    catch (err) { notify(err.message, 'error'); }
  };
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return notify('Enter a name for this saved entry preset.', 'error');
    const next = [...savedPresets.filter(p => p.name.toLowerCase() !== name.toLowerCase()), { name, kind: form.kind, category: form.category, remark: form.remark.trim() }];
    setSavedPresets(next);
    try { localStorage.setItem(`ledger_presets_${user?.id || 'guest'}`, JSON.stringify(next)); } catch {}
    setPresetName('');
    notify('Saved entry preset.');
  };
  const applyPreset = name => {
    const preset = savedPresets.find(p => p.name === name);
    if (preset) setForm(f => ({ ...f, kind: preset.kind, category: preset.category, remark: preset.remark }));
  };
  const quickDownload = format => {
    const now = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let from = '', to = '';
    if (quickDownloadPeriod === 'month') { from = iso(new Date(now.getFullYear(), now.getMonth(), 1)); to = iso(now); }
    else if (quickDownloadPeriod === 'year') { from = `${now.getFullYear()}-01-01`; to = iso(now); }
    else if (quickDownloadPeriod === 'fy') { const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear()-1; from = `${fy}-04-01`; to = iso(now); }
    else if (quickDownloadPeriod === 'pastyear') { from = `${now.getFullYear()-1}-01-01`; to = `${now.getFullYear()-1}-12-31`; }
    setReportConfig(c => ({ ...c, period: quickDownloadPeriod, from, to, financialYear: '', userId: '', category: 'all', format, preview: false }));
    setQuickDownloadPeriod('');
    setQuickAutoDownload(format);
    setReportLoading(true);
    setReportOpen(true);
  };
  const setPeriod = period => {
    const now = new Date(); const date = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let from, to = date(now);
    if (period === 'month') from = date(new Date(now.getFullYear(), now.getMonth(), 1));
    else if (period === 'year') from = `${now.getFullYear()}-01-01`;
    else if (period === 'pastyear') { from = `${now.getFullYear()-1}-01-01`; to = `${now.getFullYear()-1}-12-31`; }
    else if (period === 'fy') { const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear()-1; from = `${year}-04-01`; to = now.getMonth() >= 3 ? date(now) : `${year+1}-03-31`; }
    else { from = ''; to = ''; }
    setFilters(f => ({ ...f, from, to }));
  };
  const filteredEntries = useMemo(() => {
    const rows = entries.map(entry => ({
      ...entry,
      displayBalance: Number(entry.availableBalance || 0),
    }));
    const query = filters.search.trim().toLowerCase();
    const searched = query ? rows.filter(e => `${e.username} ${e.remark} ${e.amount} ${e.category} ${e.kind}`.toLowerCase().includes(query)) : rows;
    const dateValue = e => new Date(e.occurredAt).getTime();
    searched.sort((a, b) => {
      if (filters.sort === 'oldest') return dateValue(a) - dateValue(b) || String(a.id).localeCompare(String(b.id));
      if (filters.sort === 'low-high') return Number(a.amount) - Number(b.amount) || dateValue(b) - dateValue(a);
      if (filters.sort === 'high-low') return Number(b.amount) - Number(a.amount) || dateValue(b) - dateValue(a);
      if (filters.sort === 'person') return String(a.username).localeCompare(String(b.username)) || dateValue(b) - dateValue(a);
      return dateValue(b) - dateValue(a) || String(b.id).localeCompare(String(a.id));
    });
    return searched;
  }, [entries, filters.search, filters.sort]);
  const categories = ['normal','rental'];
  const categoryTotals = category => summary.categories.find(x => x.category === category) || { income: 0, expense: 0, debit: 0, credit: 0, balance: 0, entryCount: 0, noteCount: 0 };
  const reportRange = useMemo(() => {
    const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let from = '', to = '';
    if (reportConfig.period === 'custom') { from = reportConfig.from; to = reportConfig.to; }
    else if (reportConfig.period === 'month') { from = iso(new Date(y,m,1)); to = iso(now); }
    else if (reportConfig.period === 'year') { from = `${y}-01-01`; to = iso(now); }
    else if (reportConfig.period === 'pastyear') { from = `${y-1}-01-01`; to = `${y-1}-12-31`; }
    else if (reportConfig.period === 'fy') { const fy = Number(reportConfig.financialYear || (m >= 3 ? y : y-1)); from = `${fy}-04-01`; to = fy === (m >= 3 ? y : y-1) ? iso(now) : `${fy+1}-03-31`; }
    return { from, to };
  }, [reportConfig.period, reportConfig.from, reportConfig.to, reportConfig.financialYear]);
  useEffect(() => {
    if (!reportOpen || !token || !user) return;
    if (reportConfig.period === 'custom' && (!reportConfig.from || !reportConfig.to || reportConfig.to < reportConfig.from)) { setReportLoading(false); return; }
    let cancelled = false;
    const loadReportSource = async () => {
      setReportLoading(true);
      try {
        const params = new URLSearchParams();
        if (reportConfig.category !== 'all') params.set('category', reportConfig.category);
        params.set('sort', 'oldest');
        if (user.role === 'admin' && reportConfig.userId) params.set('userId', reportConfig.userId);
        const noteParams = new URLSearchParams();
        if (user.role === 'admin' && reportConfig.userId) noteParams.set('userId', reportConfig.userId);
        const [entriesResult, notesResult] = await Promise.all([
          request(`/entries?${params.toString()}`),
          request(`/debit-notes${noteParams.toString() ? `?${noteParams}` : ''}`)
        ]);
        if (!cancelled) { setReportEntries(entriesResult.entries || []); setReportNotes(notesResult.notes || []); }
      } catch (err) { if (!cancelled) { setQuickAutoDownload(''); setReportOpen(false); notify(`Could not prepare report: ${err.message}`, 'error'); } }
      finally { if (!cancelled) setReportLoading(false); }
    };
    loadReportSource();
    return () => { cancelled = true; };
  }, [reportOpen, reportRange.from, reportRange.to, reportConfig.period, reportConfig.from, reportConfig.to, reportConfig.category, reportConfig.userId, token, user?.id, request, notify]);

  const reportData = useMemo(() => {
    const start = reportRange.from ? new Date(`${reportRange.from}T00:00:00`).getTime() : -Infinity;
    const end = reportRange.to ? new Date(`${reportRange.to}T23:59:59.999`).getTime() : Infinity;
    const selectedUser = reportConfig.userId;
    const belongsToSelectedUser = item => !selectedUser || String(item.user?._id || item.user || item.userId || '') === selectedUser;
    const belongsToSelectedCategory = item => reportConfig.category === 'all' || item.category === reportConfig.category;
    const allRows = reportEntries.filter(e => belongsToSelectedUser(e) && belongsToSelectedCategory(e)).slice().sort((a,b)=>new Date(a.occurredAt)-new Date(b.occurredAt));
    const allNotes = reportNotes.filter(n => belongsToSelectedUser(n) && belongsToSelectedCategory(n)).slice().sort((a,b)=>new Date(a.occurredAt)-new Date(b.occurredAt));
    const rows = allRows.filter(e => { const ts = new Date(e.occurredAt).getTime(); return ts >= start && ts <= end; });
    const periodNotes = allNotes.filter(n => { const ts = new Date(n.occurredAt).getTime(); return ts >= start && ts <= end; });
    const beforeRows = allRows.filter(e => new Date(e.occurredAt).getTime() < start);
    const beforeNotes = allNotes.filter(n => new Date(n.occurredAt).getTime() < start);
    const signedEntry = e => (e.kind === 'income' ? 1 : -1) * Number(e.amount || 0);
    const signedNote = n => (n.direction === 'credit' ? 1 : -1) * Number(n.amount || 0);
    const opening = beforeRows.reduce((a,e)=>a+signedEntry(e),0) + beforeNotes.reduce((a,n)=>a+signedNote(n),0);
    const income = rows.filter(e=>e.kind==='income').reduce((a,e)=>a+Number(e.amount||0),0);
    const expense = rows.filter(e=>e.kind==='expense').reduce((a,e)=>a+Number(e.amount||0),0);
    const credits = periodNotes.filter(n=>n.direction==='credit').reduce((a,n)=>a+Number(n.amount||0),0);
    const debits = periodNotes.filter(n=>n.direction==='debit').reduce((a,n)=>a+Number(n.amount||0),0);
    const txRows = rows.map(e => ({ Date: dateTime(e.occurredAt), Person: e.username || user?.username || 'Unknown', Type: e.kind, Category: e.category, Amount: Number(e.amount || 0), AvailableBalance: Number(e.availableBalance || 0), Remark: e.remark || '' }));
    const noteRows = periodNotes.map(n=>({Date:dateTime(n.occurredAt),Person:n.username||user?.username||'Unknown',Type:n.direction,Category:n.category,Amount:Number(n.amount||0),Remark:n.remark||''}));
    const closing = opening + income - expense + credits - debits;
    return { rows, periodNotes, txRows, noteRows, opening, income, expense, credits, debits, closing, periodNet: closing-opening, transactionCount: rows.length, adjustmentCount: periodNotes.length };
  }, [reportEntries, reportNotes, reportRange, reportConfig.category, reportConfig.userId, user]);
  const reportFilename = ext => `ledger-report-${reportRange.from || 'all'}-to-${reportRange.to || 'all'}.${ext}`;
  const reportUserLabel = reportConfig.userId ? (adminUsers.find(u => u.id === reportConfig.userId)?.username || reportConfig.userId) : (user?.role === 'admin' ? 'All users' : (user?.username || 'Signed out'));
  const reportSummaryRow = () => ({
    Period: reportRange.from && reportRange.to ? `${reportRange.from} to ${reportRange.to}` : 'All time',
    Category: reportConfig.category === 'all' ? 'All categories' : reportConfig.category,
    User: reportUserLabel,
    OpeningBalance: reportData.opening, Income: reportData.income, Expenses: reportData.expense,
    AdjustmentCredits: reportData.credits, AdjustmentDebits: reportData.debits,
    ClosingBalance: reportData.closing, PeriodNet: reportData.periodNet,
    TransactionCount: reportData.transactionCount, AdjustmentCount: reportData.adjustmentCount
  });
  const finishDownload = message => { notify(message); setReportOpen(false); setQuickAutoDownload(''); };
  const excelDate = value => value ? new Date(value) : '';
  const styleHeader = (ws, row = 1, lastCol = 1) => {
    for (let c = 0; c < lastCol; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row - 1, c })];
      if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '243B63' } }, alignment: { vertical: 'center', wrapText: true } };
    }
  };
  const prepareSheet = (ws, widths, filterEndRow = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.r + 1 : 1) => {
    ws['!cols'] = widths.map(wch => ({ wch }));
    ws['!rows'] = [{ hpt: 28 }];
    if (filterEndRow > 1 && ws['!ref']) ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(widths.length - 1)}${filterEndRow}` };
    // SheetJS Community Edition keeps column sizing and filters; style metadata
    // is also attached for compatible spreadsheet readers.
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  };
  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    wb.Props = { Title: 'InOutGo Financial Report', Subject: 'Filtered income and expense transactions', Author: 'InOutGo', CreatedDate: new Date() };

    const summary = [
      ['INOUTGO · FINANCIAL REPORT'],
      ['Report period', reportRange.from && reportRange.to ? `${reportRange.from} to ${reportRange.to}` : 'All time'],
      ['Category', reportConfig.category === 'all' ? 'All categories' : reportConfig.category],
      ['User', reportUserLabel],
      [],
      ['BALANCE SUMMARY', 'AMOUNT (INR)'],
      ['Opening balance', reportData.opening],
      ['Income', reportData.income],
      ['Expenses', reportData.expense],
      ['Adjustment credits', reportData.credits],
      ['Adjustment debits', reportData.debits],
      ['Closing balance', reportData.closing],
      ['Period net', reportData.periodNet],
      [],
      ['RECORD COUNTS', 'COUNT'],
      ['Transactions', reportData.transactionCount],
      ['Adjustments', reportData.adjustmentCount]
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summary);
    summaryWs['!cols'] = [{ wch: 30 }, { wch: 28 }];
    summaryWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    summaryWs['!rows'] = [{ hpt: 30 }];
    [6, 15].forEach(r => styleHeader(summaryWs, r, 2));
    [7,8,9,10,11,12,13].forEach(r => { const cell = summaryWs[`B${r}`]; if (cell) cell.z = '₹#,##0.00;[Red]-₹#,##0.00'; });
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    const txRows = [
      ['Date & time', 'Person', 'Type', 'Category', 'Amount (₹)', 'Available balance (₹)', 'Remark'],
      ...reportData.rows.map(e => [excelDate(e.occurredAt), e.username || user?.username || 'Unknown', e.kind, e.category, Number(e.amount || 0), Number(e.availableBalance || 0), e.remark || ''])
    ];
    const txWs = XLSX.utils.aoa_to_sheet(txRows);
    prepareSheet(txWs, [23, 20, 13, 14, 17, 24, 48]);
    styleHeader(txWs, 1, 7);
    for (let r = 2; r <= txRows.length; r++) {
      if (txWs[`A${r}`]) txWs[`A${r}`].z = 'dd-mmm-yyyy hh:mm AM/PM';
      for (const col of ['E','F']) if (txWs[`${col}${r}`]) txWs[`${col}${r}`].z = '₹#,##0.00;[Red]-₹#,##0.00';
    }
    XLSX.utils.book_append_sheet(wb, txWs, 'Transactions');

    const adjustmentRows = [
      ['Date & time', 'Person', 'Adjustment', 'Category', 'Amount (₹)', 'Remark'],
      ...reportData.periodNotes.map(n => [excelDate(n.occurredAt), n.username || user?.username || 'Unknown', n.direction, n.category, Number(n.amount || 0), n.remark || ''])
    ];
    const adjWs = XLSX.utils.aoa_to_sheet(adjustmentRows);
    prepareSheet(adjWs, [23, 20, 16, 14, 17, 52]);
    styleHeader(adjWs, 1, 6);
    for (let r = 2; r <= adjustmentRows.length; r++) {
      if (adjWs[`A${r}`]) adjWs[`A${r}`].z = 'dd-mmm-yyyy hh:mm AM/PM';
      if (adjWs[`E${r}`]) adjWs[`E${r}`].z = '₹#,##0.00;[Red]-₹#,##0.00';
    }
    XLSX.utils.book_append_sheet(wb, adjWs, 'Adjustments');
    XLSX.writeFile(wb, reportFilename('xlsx'));
    finishDownload('Formatted Excel report downloaded.');
  };
  const downloadCSV = () => {
    const quote = value => { const raw = String(value ?? ''); const safe = typeof value === 'string' && /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw; return `"${safe.replace(/"/g, '""')}"`; };
    const summaryRows = [['INOUTGO · FINANCIAL REPORT'], ['Report period', reportRange.from && reportRange.to ? `${reportRange.from} to ${reportRange.to}` : 'All time'], ['Category', reportConfig.category === 'all' ? 'All categories' : reportConfig.category], ['User', reportUserLabel], [], ['BALANCE SUMMARY', 'AMOUNT (INR)'], ['Opening balance', reportData.opening], ['Income', reportData.income], ['Expenses', reportData.expense], ['Adjustment credits', reportData.credits], ['Adjustment debits', reportData.debits], ['Closing balance', reportData.closing], ['Period net', reportData.periodNet], [], ['RECORD COUNTS', 'COUNT'], ['Transactions', reportData.transactionCount], ['Adjustments', reportData.adjustmentCount]];
    const transactionRows = [['TRANSACTIONS'], ['Date & time','Person','Type','Category','Amount (INR)','Available balance (INR)','Remark'], ...reportData.txRows.map(r=>[r.Date,r.Person,r.Type,r.Category,r.Amount,r.AvailableBalance,r.Remark])];
    const adjustmentRows = [['ADJUSTMENTS'], ['Date & time','Person','Adjustment','Category','Amount (INR)','Remark'], ...reportData.noteRows.map(r=>[r.Date,r.Person,r.Type,r.Category,r.Amount,r.Remark])];
    const csv = [...summaryRows, [], ...transactionRows, [], ...adjustmentRows].map(row=>row.map(quote).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = reportFilename('csv'); document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    finishDownload('Formatted CSV report downloaded.');
  };
  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setProperties({ title: 'InOutGo Financial Report', subject: 'Filtered income and expense report', author: 'InOutGo' });
    const periodLabel = reportRange.from && reportRange.to ? `${reportRange.from} to ${reportRange.to}` : 'All time';
    const pdfMoney = value => `INR ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    const drawPage = data => {
      doc.setFontSize(8); doc.setTextColor(115); doc.text('INOUTGO · PRIVATE LEDGER', 14, 8);
      doc.text(`Page ${data.pageNumber}`, 283, 8, { align: 'right' });
    };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(28, 43, 69); doc.text('Income & Expense Report', 14, 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
    doc.text(`Period: ${periodLabel}   |   Category: ${reportConfig.category === 'all' ? 'All categories' : reportConfig.category}   |   User: ${reportUserLabel}`, 14, 24);
    autoTable(doc, {
      startY: 29, head: [['Date & time','Person','Type','Category','Amount (₹)','Remark']],
      body: reportData.txRows.length ? reportData.txRows.map(r => [r.Date,r.Person,r.Type,r.Category,pdfMoney(r.Amount),r.Remark]) : [['—','—','No transactions','—','—','No records for selected filters']],
      margin: { left: 14, right: 14, bottom: 14 }, styles: { fontSize: 7.5, cellPadding: 2.2, overflow: 'linebreak' },
      headStyles: { fillColor: [37, 59, 99], textColor: 255 }, alternateRowStyles: { fillColor: [244, 247, 252] },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 30 }, 2: { cellWidth: 20 }, 3: { cellWidth: 20 }, 4: { cellWidth: 29, halign: 'right' }, 5: { cellWidth: 'auto' } },
      didDrawPage: drawPage
    });
    if (reportData.noteRows.length) autoTable(doc, {
      startY: (doc.lastAutoTable?.finalY || 30) + 7, head: [['Date & time','Person','Adjustment','Category','Amount (₹)','Remark']],
      body: reportData.noteRows.map(n => [n.Date,n.Person,n.Type,n.Category,pdfMoney(n.Amount),n.Remark]),
      margin: { left: 14, right: 14, bottom: 14 }, styles: { fontSize: 7.5, cellPadding: 2.2 },
      headStyles: { fillColor: [70, 80, 100], textColor: 255 }, alternateRowStyles: { fillColor: [247, 248, 250] }, didDrawPage: drawPage
    });
    autoTable(doc, {
      startY: (doc.lastAutoTable?.finalY || 30) + 8, head: [['FILTERED PERIOD SUMMARY','AMOUNT']],
      body: [['Opening balance',pdfMoney(reportData.opening)],['Income',pdfMoney(reportData.income)],['Expenses',pdfMoney(reportData.expense)],['Adjustment credits',pdfMoney(reportData.credits)],['Adjustment debits',pdfMoney(reportData.debits)],['Closing balance',pdfMoney(reportData.closing)],['Period net',pdfMoney(reportData.periodNet)],['Transactions / adjustments',`${reportData.transactionCount} / ${reportData.adjustmentCount}`]],
      margin: { left: 14, right: 14, bottom: 14 }, styles: { fontSize: 8.5, cellPadding: 2.8 },
      headStyles: { fillColor: [37, 59, 99], textColor: 255 }, columnStyles: { 0: { cellWidth: 75 }, 1: { cellWidth: 48, halign: 'right' } }, didDrawPage: drawPage
    });
    doc.save(reportFilename('pdf'));
    finishDownload('Formatted PDF report downloaded.');
  };
  useEffect(() => {
    if (!reportOpen || !quickAutoDownload || reportLoading) return;
    if (reportConfig.format === 'excel') downloadExcel();
    else if (reportConfig.format === 'pdf') downloadPDF();
    else downloadCSV();
  }, [reportOpen, quickAutoDownload, reportLoading, reportEntries, reportNotes]);



  // Render the sign-in screen before accessing authenticated user properties.
  // Without this guard, a fresh session (no saved token/user) crashes at user.role
  // and appears as a blank screen.
  if (!token || !user) return <main className="login-screen"><div className="login-glow"/>{authMode === 'login' ? <form className="login-card" onSubmit={login}><div className="brand-mark"><Wallet size={25}/></div><p className="eyebrow">PRIVATE LEDGER</p><h1>Welcome back<span>.</span></h1><p className="muted">Sign in to manage income and expenses.</p><label>Your name<input autoComplete="username" value={loginName} onChange={e=>setLoginName(e.target.value.toUpperCase())} placeholder="e.g. KAILASH" required /></label><label>Password<input type="password" autoComplete="current-password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Enter your password" required /></label><button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowUpRight size={17}/></button><p className="login-foot"><LockKeyhole size={13}/> First time here? Create your account.</p><button type="button" className="text-button auth-switch" onClick={()=>setAuthMode('signup')}>Create account <ArrowUpRight size={14}/></button></form> : <form className="login-card" onSubmit={signup}><div className="brand-mark"><Wallet size={25}/></div><p className="eyebrow">NEW ACCOUNT</p><h1>Create account<span>.</span></h1><p className="muted">Use your family name and a private password. Names are saved in capital letters.</p><label>Your name<input autoComplete="username" value={signupName} onChange={e=>setSignupName(e.target.value.toUpperCase())} placeholder="e.g. KAILASH" minLength={2} maxLength={30} required /></label><label>Password<input type="password" autoComplete="new-password" value={signupPassword} onChange={e=>setSignupPassword(e.target.value)} placeholder="At least 12 characters" minLength={12} maxLength={128} required /></label><button className="primary full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'} <Check size={17}/></button><p className="login-foot"><LockKeyhole size={13}/> The first account must be KAILASH and becomes admin.</p><button type="button" className="text-button auth-switch" onClick={()=>setAuthMode('login')}>Already registered? Sign in</button></form>}{toast && <Toast toast={toast}/>}</main>;


  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Wallet size={22}/></div><div><strong>Ledger<span>.</span></strong><small>INCOME & EXPENSE</small></div></div><div className="workspace-label">WORKSPACE</div><nav>
      <button className={page==='overview'?'active':''} onClick={()=>setPage('overview')}><Home size={18}/> Overview</button>
      <button className={page==='entries'?'active':''} onClick={()=>setPage('entries')}><Activity size={18}/> Transactions</button>
      <button className={page==='settlements'?'active':''} onClick={()=>setPage('settlements')}><ReceiptText size={18}/> Debit notes</button>
      {user.role==='admin' && <><div className="workspace-label admin-label">ADMINISTRATION</div><button className={page==='admin'?'active':''} onClick={()=>setPage('admin')}><Users size={18}/> People & totals</button></>}
    </nav><div className="sidebar-bottom"><div className="secure-pill"><ShieldCheck size={16}/><span><b>Private workspace</b><small>Secure sign-in enabled</small></span></div><button className="nav-quiet" onClick={()=>setPasswordOpen(true)}><LockKeyhole size={16}/> Change password</button><button className="nav-quiet" onClick={()=>logout()}><LogOut size={16}/> Sign out</button><div className="version">LEDGER WEB · 1.1.1</div></div></aside>
    <main className="main-content"><header className="topbar"><div><p className="eyebrow">YOUR FINANCES, AT A GLANCE</p><h1>{page==='overview'?'Overview':page==='entries'?'Transactions':page==='settlements'?'Debit notes':'People & totals'}</h1></div><div className="top-actions"><div className="today-chip"><CalendarDays size={15}/>{new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div><div className="avatar">{user.username.slice(0,1)}</div><div className="user-chip"><b>{user.username}</b><small>{user.role==='admin'?'Administrator':'Member'}</small></div></div></header>
    {user.mustChangePassword && <div className="notice"><LockKeyhole size={17}/><span>For your security, change your temporary password before using the ledger.</span><button onClick={()=>setPasswordOpen(true)}>Change password</button></div>}
     <div className="toolbar"><div className="period-buttons">{[['month','This month'],['year','This year'],['fy','Financial year'],['pastyear','Past year'],['all','All time']].map(([period,label])=><button key={period} onClick={()=>setQuickDownloadPeriod(period)}>{label}</button>)}</div><div className="toolbar-actions"><button className="secondary" onClick={()=>{setQuickAutoDownload('');setReportConfig(c=>({...c,userId:'',category:'all',period:'month',from:'',to:'',format:'excel'}));setReportOpen(true);}}><Download size={16}/> Advanced download</button><button className="primary" onClick={openAdd}><Plus size={17}/> Add entry</button></div></div>
    {page==='overview' && <>
      <section className="main-balance-card"><div><span className="card-label">SHARED MAIN BALANCE · NORMAL ONLY</span><h2>{money(summary.mainBalance)}</h2><p>Combined Normal ledger across Admin and all family accounts. Rental balances remain separate.</p></div><div className="metric-icon"><Wallet size={21}/></div></section>
      <section className="balance-grid">{categories.map((c,i)=>{const t=categoryTotals(c);return <div className={`balance-card ${i===1?'rental-card':''}`} key={c}><div className="card-top"><div><span className="card-label">{c==='normal'?'NORMAL BALANCE':'RENTAL BALANCE'}</span><h2>{money(t.balance)}</h2></div><div className={`metric-icon ${i===1?'violet':''}`}>{c==='normal'?<Wallet size={20}/>:<Home size={20}/>}</div></div><div className="card-rule"/><div className="balance-meta"><span><i className="dot income-dot"/> Income <b>{money(t.income)}</b></span><span><i className="dot expense-dot"/> Expense <b>{money(t.expense)}</b></span></div><div className="card-bottom"><span>{t.entryCount} entries</span><span>{t.noteCount} settlement notes</span></div></div>})}</section>
      <section className="section-heading"><div><h2>Recent transactions</h2><p>Your latest income and expense activity</p></div><button className="text-button" onClick={()=>setPage('entries')}>View all <ArrowUpRight size={15}/></button></section>
      <TransactionTable entries={filteredEntries.slice(0,7)} currentUser={user} onEdit={openEdit} />
      <div className="tip-row"><div className="tip-icon"><Clock3 size={19}/></div><div><b>One-hour edit window</b><p>Entries can be edited by their creator within one hour. After that, use a debit note to record a settlement.</p></div><button className="secondary" onClick={()=>setNoteOpen(true)}>Create debit note <ArrowUpRight size={15}/></button></div>
    </>}
    {page==='entries' && <><section className="filter-panel"><div className="searchbox"><Search size={16}/><input placeholder="Search person, remark or amount…" value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))}/></div><div className="select-filter"><Filter size={15}/><select value={filters.kind} onChange={e=>setFilters(f=>({...f,kind:e.target.value}))}><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option></select></div><div className="select-filter"><SlidersHorizontal size={15}/><select value={filters.category} onChange={e=>setFilters(f=>({...f,category:e.target.value}))}><option value="all">All categories</option><option value="normal">Normal</option><option value="rental">Rental</option></select></div><select className="sort-select" value={filters.sort} onChange={e=>setFilters(f=>({...f,sort:e.target.value}))}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="low-high">Amount: low to high</option><option value="high-low">Amount: high to low</option><option value="person">Person wise</option></select></section><section className="date-filters"><label>From<input type="date" value={filters.from} onChange={e=>setFilters(f=>({...f,from:e.target.value}))}/></label><label>To<input type="date" value={filters.to} onChange={e=>setFilters(f=>({...f,to:e.target.value}))}/></label><button className="text-button" onClick={()=>{setFilters(f=>({...f,from:'',to:'',kind:'all',category:'all',sort:'newest',search:'',userId:''}));}}>Clear filters <X size={14}/></button><span className="result-count">{filteredEntries.length} records</span></section><TransactionTable entries={filteredEntries} currentUser={user} onEdit={openEdit}/></>}
    {page==='settlements' && <><div className="page-intro"><div><h2>Settlement history</h2><p>Use debit or credit notes for adjustments after the edit window.</p></div><button className="primary" onClick={()=>setNoteOpen(true)}><Plus size={17}/> New debit note</button></div><div className="table-wrap"><table><thead><tr><th>DATE & TIME</th>{user.role==='admin'&&<th>PERSON</th>}<th>TYPE</th><th>CATEGORY</th><th>AMOUNT</th><th>REMARK</th></tr></thead><tbody>{notes.map(n=><tr key={n.id||n._id}><td>{dateTime(n.occurredAt)}</td>{user.role==='admin'&&<td><span className="person-cell"><span className="mini-avatar">{n.username?.[0]}</span>{n.username}</span></td>}<td><span className={`type-pill ${n.direction==='credit'?'income':'expense'}`}>{n.direction}</span></td><td><span className={`category-pill ${n.category}`}>{n.category}</span></td><td className={n.direction==='credit'?'amount-positive':'amount-negative'}>{money(n.amount)}</td><td className="remark-cell">{n.remark}</td></tr>)}{!notes.length&&<EmptyRow cols={user.role==='admin'?6:5} message="No settlement notes yet"/>}</tbody></table></div></>}
    {page==='admin' && user.role==='admin' && <><div className="page-intro"><div><h2>Family accounts</h2><p>Add a new family member or remove access while preserving their financial history.</p></div><button className="primary" onClick={()=>{setNewUserForm({username:'',password:''});setUserModalOpen(true);}}><Plus size={16}/> Add user</button></div><section className="admin-summary"><div><span className="card-label">ACTIVE USERS</span><h2>{adminUsers.filter(u=>u.active).length}</h2></div><div><span className="card-label">TOTAL ENTRIES</span><h2>{adminUsers.reduce((a,u)=>a+u.totalEntries,0)}</h2></div><div><span className="card-label">SETTLEMENT NOTES</span><h2>{adminUsers.reduce((a,u)=>a+u.totalNotes,0)}</h2></div></section><section className="section-heading"><div><h2>User-wise balances</h2><p>Passwords are never displayed. Removed users' old entries remain in the ledger.</p></div></section><div className="table-wrap"><table><thead><tr><th>PERSON</th><th>STATUS</th><th>NORMAL BALANCE</th><th>RENTAL BALANCE</th><th>ENTRIES</th><th>NOTES</th><th>ACCESS</th></tr></thead><tbody>{adminUsers.map(u=><tr key={u.id}><td><span className="person-cell"><span className="mini-avatar">{u.username[0]}</span><span><b>{u.username}</b><small className="role-label">{u.role}</small></span></span></td><td><span className={`status-pill ${u.active?'status-active':'status-inactive'}`}>{u.active?'Active':'Archived'}</span></td><td className={u.normal.balance>=0?'amount-positive':'amount-negative'}>{money(u.normal.balance)}<small className="sub-total">In {money(u.normal.income)} · Out {money(u.normal.expense)}</small></td><td className={u.rental.balance>=0?'amount-positive':'amount-negative'}>{money(u.rental.balance)}<small className="sub-total">In {money(u.rental.income)} · Out {money(u.rental.expense)}</small></td><td>{u.totalEntries}</td><td>{u.totalNotes}</td><td>{u.role==='admin'?<span className="role-label">Protected</span>:u.active?<button className="secondary small-action" onClick={()=>archiveUser(u)}>Remove access</button>:<button className="secondary small-action" onClick={()=>restoreUser(u)}>Restore</button>}</td></tr>)}</tbody></table></div></>}
    <footer className="footer"><span>Ledger <b>·</b> Keep every entry accountable.</span><span><span className="live-dot"/> Synced with cloud database</span></footer>
    </main>
    {quickDownloadPeriod && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setQuickDownloadPeriod('')}><section className="modal-card quick-download-modal"><div className="modal-head"><div><p className="eyebrow">QUICK DOWNLOAD</p><h2>Choose file format</h2><p className="muted">{({month:'This month',year:'This year',fy:'Financial year',pastyear:'Past year',all:'All time'})[quickDownloadPeriod]} · all categories · {user.role==='admin'?'all users':'your transactions'}</p></div><button type="button" className="icon-button" onClick={()=>setQuickDownloadPeriod('')}><X size={19}/></button></div><div className="quick-format-grid"><button className="secondary" onClick={()=>quickDownload('csv')}><FileText size={17}/> CSV</button><button className="secondary" onClick={()=>quickDownload('excel')}><FileSpreadsheet size={17}/> Excel</button><button className="secondary" onClick={()=>quickDownload('pdf')}><FileText size={17}/> PDF</button></div></section></div>}
    {reportOpen && !quickAutoDownload && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setReportOpen(false);setQuickAutoDownload('');}}}><section className="modal-card report-modal"><div className="modal-head"><div><p className="eyebrow">ADVANCED REPORT BUILDER</p><h2>Configure download</h2><p className="muted">Choose period, user, category and output format before previewing or downloading.</p></div><button type="button" className="icon-button" onClick={()=>{setReportOpen(false);setQuickAutoDownload('');}}><X size={19}/></button></div>
      <label>1. Reporting period<select value={reportConfig.period} onChange={e=>setReportConfig(c=>({...c,period:e.target.value}))}><option value="month">This Month</option><option value="year">This Year</option><option value="fy">Financial Year (April–March)</option><option value="pastyear">Past Year</option><option value="all">All Time</option><option value="custom">Custom Date Range</option></select></label>
      {reportConfig.period==='fy' && <label>Financial year starts in<select value={reportConfig.financialYear || (new Date().getMonth()>=3?new Date().getFullYear():new Date().getFullYear()-1)} onChange={e=>setReportConfig(c=>({...c,financialYear:e.target.value}))}>{Array.from({length:8},(_,i)=>{const year=(new Date().getMonth()>=3?new Date().getFullYear():new Date().getFullYear()-1)-i;return <option key={year} value={year}>{year}–{year+1}</option>})}</select></label>}
      {reportConfig.period==='custom' && <div className="form-two"><label>From date<input type="date" value={reportConfig.from} onChange={e=>setReportConfig(c=>({...c,from:e.target.value}))} required/></label><label>To date<input type="date" value={reportConfig.to} min={reportConfig.from||undefined} onChange={e=>setReportConfig(c=>({...c,to:e.target.value}))} required/></label></div>}
      {user.role==='admin' && <label>3. User<select value={reportConfig.userId} onChange={e=>setReportConfig(c=>({...c,userId:e.target.value}))}><option value="">All users</option>{adminUsers.map(u=><option key={u.id} value={u.id}>{u.username}</option>)}</select></label>}
      <label>4. Category<select value={reportConfig.category} onChange={e=>setReportConfig(c=>({...c,category:e.target.value}))}><option value="all">All Categories</option><option value="normal">Normal</option><option value="rental">Rental</option></select></label>
      <label>5. Download format<select value={reportConfig.format} onChange={e=>setReportConfig(c=>({...c,format:e.target.value}))}><option value="excel">Excel (.xlsx)</option><option value="pdf">PDF (.pdf)</option><option value="csv">CSV (.csv)</option></select></label>
      <div className="report-preview"><div className="report-preview-title"><b>Report preview</b><span>{reportLoading ? 'Loading report…' : `${reportData.rows.length} transactions · ${reportData.noteRows.length} adjustments`}</span></div><div className="report-metrics"><div><small>Opening balance</small><b>{money(reportData.opening)}</b></div><div><small>Income</small><b>{money(reportData.income)}</b></div><div><small>Expenses</small><b>{money(reportData.expense)}</b></div><div><small>Adjustments (net)</small><b>{money(reportData.credits-reportData.debits)}</b></div><div><small>Closing balance</small><b>{money(reportData.closing)}</b></div><div><small>Period net</small><b>{money(reportData.periodNet)}</b></div></div><p className="muted">Period: {reportRange.from||'All time'} → {reportRange.to||'All time'} · Opening balance is the selected account/category balance before the period; closing includes the selected period's transactions and adjustments.</p>{reportData.rows.slice(0,4).map((r,i)=><div className="preview-row" key={`${r._id||r.id||i}-${i}`}><span>{dateTime(r.occurredAt)} · {r.username||user?.username||'Unknown'}</span><b>{r.kind==='income'?'+':'−'}{money(r.amount)}</b></div>)}{reportData.rows.length>4&&<small className="muted">and {reportData.rows.length-4} more transactions…</small>}</div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={()=>{setReportOpen(false);setQuickAutoDownload('');}}>Cancel</button><button type="button" className="secondary" disabled={reportLoading||(reportConfig.period==='custom'&&(!reportConfig.from||!reportConfig.to||reportConfig.to<reportConfig.from))} onClick={()=>reportConfig.format==='excel'?downloadExcel():reportConfig.format==='pdf'?downloadPDF():downloadCSV()}><Download size={15}/> Download {reportConfig.format.toUpperCase()}</button></div></section></div>}
    {userModalOpen && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setUserModalOpen(false)}><form className="modal-card" onSubmit={createUser}><div className="modal-head"><div><p className="eyebrow">FAMILY ACCOUNTS</p><h2>Add family member</h2><p className="muted">Create a login for a new family member. The temporary password must be changed at first sign-in.</p></div><button type="button" className="icon-button" onClick={()=>setUserModalOpen(false)}><X size={19}/></button></div><label>Full name<input autoComplete="off" value={newUserForm.username} onChange={e=>setNewUserForm(f=>({...f,username:e.target.value.toUpperCase()}))} minLength={2} maxLength={30} required placeholder="e.g. NEW MEMBER" /></label><label>Temporary password<input type="password" autoComplete="new-password" value={newUserForm.password} onChange={e=>setNewUserForm(f=>({...f,password:e.target.value}))} minLength={12} maxLength={128} required placeholder="At least 12 characters" /></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setUserModalOpen(false)}>Cancel</button><button className="primary">Create account <Check size={16}/></button></div></form></div>}
    {formOpen && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setFormOpen(false)}><form className="modal-card" onSubmit={saveEntry}><div className="modal-head"><div><p className="eyebrow">LEDGER ENTRY</p><h2>{editing?'Edit transaction':'Add transaction'}</h2><p className="muted">Saved with your account name and current date & time.</p></div><button type="button" className="icon-button" onClick={()=>setFormOpen(false)}><X size={19}/></button></div><div className="segmented"><button type="button" className={form.kind==='income'?'selected income-select':''} onClick={()=>setForm(f=>({...f,kind:'income'}))}><ArrowDownLeft size={16}/> Income</button><button type="button" className={form.kind==='expense'?'selected expense-select':''} onClick={()=>setForm(f=>({...f,kind:'expense'}))}><ArrowUpRight size={16}/> Expense</button></div><label>Category <span className="required">*</span><div className="category-options"><button type="button" className={form.category==='normal'?'category-option chosen':''} onClick={()=>setForm(f=>({...f,category:'normal'}))}><Wallet size={18}/><span><b>Normal</b><small>Default category</small></span>{form.category==='normal'&&<Check size={16}/>}</button><button type="button" className={form.category==='rental'?'category-option chosen rental-chosen':''} onClick={()=>setForm(f=>({...f,category:'rental'}))}><Home size={18}/><span><b>Rental</b><small>Separate balance</small></span>{form.category==='rental'&&<Check size={16}/>}</button></div></label><div className="preset-row"><label>Saved entries<select value="" onChange={e=>applyPreset(e.target.value)}><option value="">Choose a saved entry…</option>{savedPresets.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select></label><div className="preset-save"><input aria-label="Preset name" placeholder="Preset name" value={presetName} onChange={e=>setPresetName(e.target.value)} maxLength={50}/><button type="button" className="secondary" onClick={savePreset}>Save preset</button></div></div><label>Amount (₹) <span className="required">*</span><div className="amount-input"><span>₹</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} required/></div></label><label>Remark <span className="required">* Compulsory</span><textarea maxLength={500} rows={3} placeholder="Why is this entry being recorded?" value={form.remark} onChange={e=>setForm(f=>({...f,remark:e.target.value}))} required/><small className="field-hint">{form.remark.length}/500 characters</small></label><div className="auto-time"><Clock3 size={15}/><span>Current date & time will be recorded automatically.</span></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setFormOpen(false)}>Cancel</button><button className="primary" disabled={busy}>{editing?'Save changes':'Save entry'} <Check size={16}/></button></div></form></div>}
    {noteOpen && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setNoteOpen(false)}><form className="modal-card" onSubmit={saveNote}><div className="modal-head"><div><p className="eyebrow">POST-EDIT SETTLEMENT</p><h2>Create debit note</h2><p className="muted">Record an adjustment without changing the locked original entry.</p></div><button type="button" className="icon-button" onClick={()=>setNoteOpen(false)}><X size={19}/></button></div><label>Related entry (optional)<select value={noteForm.originalEntryId} onChange={e=>{const selected=entries.find(x=>(x.id||x._id)===e.target.value);setNoteForm(f=>({...f,originalEntryId:e.target.value,...(selected?{category:selected.category}:{})}));}}><option value="">General settlement</option>{entries.filter(e=>e.username===user.username||user.role==='admin').map(e=><option key={e.id||e._id} value={e.id||e._id}>{dateTime(e.occurredAt)} · {e.username} · {money(e.amount)} · {e.remark.slice(0,45)}</option>)}</select></label><div className="form-two"><label>Category<select value={noteForm.category} onChange={e=>setNoteForm(f=>({...f,category:e.target.value}))}><option value="normal">Normal</option><option value="rental">Rental</option></select></label><label>Adjustment<select value={noteForm.direction} onChange={e=>setNoteForm(f=>({...f,direction:e.target.value}))}><option value="debit">Debit (reduces balance)</option><option value="credit">Credit (adds to balance)</option></select></label></div><label>Amount (₹)<div className="amount-input"><span>₹</span><input type="number" min="0.01" step="0.01" value={noteForm.amount} onChange={e=>setNoteForm(f=>({...f,amount:e.target.value}))} required placeholder="0.00"/></div></label><label>Settlement remark <span className="required">* Compulsory</span><textarea rows={3} maxLength={500} value={noteForm.remark} onChange={e=>setNoteForm(f=>({...f,remark:e.target.value}))} required placeholder="Explain the correction or settlement…"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setNoteOpen(false)}>Cancel</button><button className="primary">Save settlement <Check size={16}/></button></div></form></div>}
    {passwordOpen && <div className="modal-backdrop"><form className="modal-card password-modal" onSubmit={changePassword}><div className="modal-head"><div><p className="eyebrow">ACCOUNT SECURITY</p><h2>Change password</h2><p className="muted">Use a unique password with at least 12 characters.</p></div>{!user.mustChangePassword&&<button type="button" className="icon-button" onClick={()=>setPasswordOpen(false)}><X size={19}/></button>}</div><label>Current password<input type="password" autoComplete="current-password" value={pwForm.currentPassword} onChange={e=>setPwForm(f=>({...f,currentPassword:e.target.value}))} required/></label><label>New password<input type="password" autoComplete="new-password" minLength={12} value={pwForm.newPassword} onChange={e=>setPwForm(f=>({...f,newPassword:e.target.value}))} required/></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} value={pwForm.confirmPassword} onChange={e=>setPwForm(f=>({...f,confirmPassword:e.target.value}))} required/></label><div className="modal-actions"><button type="submit" className="primary full">Update password <Check size={16}/></button></div></form></div>}
    {toast&&<Toast toast={toast}/>}
  </div>;
}

function TransactionTable({ entries, currentUser, onEdit }) {
  return <div className="table-wrap"><table><thead><tr><th>DATE & TIME</th>{currentUser.role==='admin'&&<th>PERSON</th>}<th>TYPE</th><th>CATEGORY</th><th>AMOUNT</th><th>AVAILABLE BALANCE</th><th>REMARK</th><th>EDIT</th></tr></thead><tbody>{entries.map(e=>{const id=e.id||e._id;const own=e.username===currentUser.username;const editable=own&&Date.now()-new Date(e.createdAt).getTime()<=3600000;return <tr key={id}><td><span className="date-cell">{dateTime(e.occurredAt)}</span></td>{currentUser.role==='admin'&&<td><span className="person-cell"><span className="mini-avatar">{e.username?.[0]}</span>{e.username}</span></td>}<td><span className={`type-pill ${e.kind}`}>{e.kind==='income'?<ArrowDownLeft size={13}/>:<ArrowUpRight size={13}/>} {e.kind}</span></td><td><span className={`category-pill ${e.category}`}>{e.category}</span></td><td className={e.kind==='income'?'amount-positive':'amount-negative'}>{e.kind==='income'?'+':'−'}{money(e.amount)}</td><td className={Number(e.displayBalance)>=0?'amount-positive':'amount-negative'}><b>{money(e.displayBalance)}</b><small className="sub-total">{own ? 'Your balance after entry' : 'User balance after entry'}</small></td><td className="remark-cell" title={e.remark}>{e.remark}</td><td>{editable?<button className="icon-button" title="Edit entry (available for one hour)" onClick={()=>onEdit(e)}><Pencil size={15}/></button>:<span className="locked" title={own?'Edit window expired':'Only the creator can edit'}><LockKeyhole size={14}/></span>}</td></tr>})}{!entries.length&&<EmptyRow cols={currentUser.role==='admin'?8:7} message="No transactions found"/>}</tbody></table></div>;
}
function EmptyRow({cols,message}) { return <tr><td colSpan={cols}><div className="empty-state"><div><ReceiptText size={22}/></div><b>{message}</b><span>Try changing your filters or add a new entry.</span></div></td></tr>; }
function Toast({toast}) { return <div className={`toast ${toast.type==='error'?'toast-error':''}`} role="status"><span className="toast-icon">{toast.type==='error'?<X size={16}/>:<Check size={16}/>}</span>{toast.message}</div>; }

export default App;
