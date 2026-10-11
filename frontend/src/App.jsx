import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, CircleDollarSign, Clock3, Download, FileSpreadsheet, FileText, Filter, Home, LogOut, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Wallet, X, Pencil, ReceiptText, Users, LockKeyhole } from 'lucide-react';
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
  const [page, setPage] = useState('overview'); const [summary, setSummary] = useState({ categories: [], total: 0 });
  const [entries, setEntries] = useState([]); const [notes, setNotes] = useState([]); const [adminUsers, setAdminUsers] = useState([]);
  const [toast, setToast] = useState(null); const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false); const [form, setForm] = useState(blankForm); const [editing, setEditing] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false); const [noteForm, setNoteForm] = useState({ originalEntryId: '', category: 'normal', direction: 'debit', amount: '', remark: '' });
  const [passwordOpen, setPasswordOpen] = useState(false); const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [filters, setFilters] = useState({ kind: 'all', category: 'all', sort: 'newest', from: '', to: '', search: '', userId: '' });

  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.setTimeout(() => setToast(null), 3000); }, []);
  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status === 401 && token) { logout(false); } throw new Error(data.message || 'Request failed.'); }
    return data;
  }, [token]);
  const logout = (show = true) => { localStorage.removeItem('ledger_token'); localStorage.removeItem('ledger_user'); setToken(''); setUser(null); setEntries([]); setSummary({ categories: [], total: 0 }); if (show) notify('Signed out.'); };

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
  useEffect(() => { if (token && user) loadData(); }, [token, user?.id, filters.from, filters.to, filters.kind, filters.category, filters.sort, filters.userId]);

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
  const filteredEntries = useMemo(() => entries.filter(e => !filters.search || `${e.username} ${e.remark} ${e.amount} ${e.category} ${e.kind}`.toLowerCase().includes(filters.search.toLowerCase())), [entries, filters.search]);
  const categories = ['normal','rental'];
  const categoryTotals = category => summary.categories.find(x => x.category === category) || { income: 0, expense: 0, debit: 0, credit: 0, balance: 0, entryCount: 0, noteCount: 0 };
  const exportRows = useMemo(() => filteredEntries.map(e => ({ Date: dateTime(e.occurredAt), Person: e.username, Type: e.kind, Category: e.category, Amount: Number(e.amount), Remark: e.remark })), [filteredEntries]);
  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), 'Entries');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categories.map(c => ({ Category: c, Income: categoryTotals(c).income, Expense: categoryTotals(c).expense, DebitNotes: categoryTotals(c).debit, CreditNotes: categoryTotals(c).credit, Balance: categoryTotals(c).balance }))), 'Summary');
    if (user.role === 'admin') XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(adminUsers.map(u => ({ Person: u.username, NormalBalance: u.normal.balance, RentalBalance: u.rental.balance, Entries: u.totalEntries }))), 'People');
    XLSX.writeFile(wb, `ledger-report-${new Date().toISOString().slice(0,10)}.xlsx`); notify('Excel report downloaded.');
  };
  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' }); doc.setFontSize(18); doc.text('Income & Expense Report', 14, 16); doc.setFontSize(9); doc.text(`Generated: ${new Date().toLocaleString('en-IN')} | User: ${user.username}`, 14, 23);
    autoTable(doc, { startY: 29, head: [['Date & time','Person','Type','Category','Amount (INR)','Remark']], body: exportRows.map(r => [r.Date,r.Person,r.Type,r.Category,Number(r.Amount).toLocaleString('en-IN'),r.Remark]), styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [37, 99, 235] } });
    const y = (doc.lastAutoTable?.finalY || 30) + 10; doc.setFontSize(11); doc.text(`Normal balance: ${money(categoryTotals('normal').balance)}     Rental balance: ${money(categoryTotals('rental').balance)}`, 14, y);
    doc.save(`ledger-report-${new Date().toISOString().slice(0,10)}.pdf`); notify('PDF report downloaded.');
  };

  if (!token || !user) return <main className="login-screen"><div className="login-glow"/>{authMode === 'login' ? <form className="login-card" onSubmit={login}><div className="brand-mark"><Wallet size={25}/></div><p className="eyebrow">PRIVATE LEDGER</p><h1>Welcome back<span>.</span></h1><p className="muted">Sign in to manage income and expenses.</p><label>Your name<input autoComplete="username" value={loginName} onChange={e=>setLoginName(e.target.value.toUpperCase())} placeholder="e.g. KAILASH" required /></label><label>Password<input type="password" autoComplete="current-password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Enter your password" required /></label><button className="primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowUpRight size={17}/></button><p className="login-foot"><LockKeyhole size={13}/> First time here? Create your account.</p><button type="button" className="text-button auth-switch" onClick={()=>setAuthMode('signup')}>Create account <ArrowUpRight size={14}/></button></form> : <form className="login-card" onSubmit={signup}><div className="brand-mark"><Wallet size={25}/></div><p className="eyebrow">NEW ACCOUNT</p><h1>Create account<span>.</span></h1><p className="muted">Use your family name and a private password. Names are saved in capital letters.</p><label>Your name<input autoComplete="username" value={signupName} onChange={e=>setSignupName(e.target.value.toUpperCase())} placeholder="e.g. KAILASH" minLength={2} maxLength={30} required /></label><label>Password<input type="password" autoComplete="new-password" value={signupPassword} onChange={e=>setSignupPassword(e.target.value)} placeholder="At least 12 characters" minLength={12} maxLength={128} required /></label><button className="primary full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'} <Check size={17}/></button><p className="login-foot"><LockKeyhole size={13}/> The first account must be KAILASH and becomes admin.</p><button type="button" className="text-button auth-switch" onClick={()=>setAuthMode('login')}>Already registered? Sign in</button></form>}{toast && <Toast toast={toast}/>}</main>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Wallet size={22}/></div><div><strong>Ledger<span>.</span></strong><small>INCOME & EXPENSE</small></div></div><div className="workspace-label">WORKSPACE</div><nav>
      <button className={page==='overview'?'active':''} onClick={()=>setPage('overview')}><Home size={18}/> Overview</button>
      <button className={page==='entries'?'active':''} onClick={()=>setPage('entries')}><Activity size={18}/> Transactions</button>
      <button className={page==='settlements'?'active':''} onClick={()=>setPage('settlements')}><ReceiptText size={18}/> Debit notes</button>
      {user.role==='admin' && <><div className="workspace-label admin-label">ADMINISTRATION</div><button className={page==='admin'?'active':''} onClick={()=>setPage('admin')}><Users size={18}/> People & totals</button></>}
    </nav><div className="sidebar-bottom"><div className="secure-pill"><ShieldCheck size={16}/><span><b>Private workspace</b><small>Secure sign-in enabled</small></span></div><button className="nav-quiet" onClick={()=>setPasswordOpen(true)}><LockKeyhole size={16}/> Change password</button><button className="nav-quiet" onClick={()=>logout()}><LogOut size={16}/> Sign out</button><div className="version">LEDGER WEB · 1.0.0</div></div></aside>
    <main className="main-content"><header className="topbar"><div><p className="eyebrow">YOUR FINANCES, AT A GLANCE</p><h1>{page==='overview'?'Overview':page==='entries'?'Transactions':page==='settlements'?'Debit notes':'People & totals'}</h1></div><div className="top-actions"><div className="today-chip"><CalendarDays size={15}/>{new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div><div className="avatar">{user.username.slice(0,1)}</div><div className="user-chip"><b>{user.username}</b><small>{user.role==='admin'?'Administrator':'Member'}</small></div></div></header>
    {user.mustChangePassword && <div className="notice"><LockKeyhole size={17}/><span>For your security, change your temporary password before using the ledger.</span><button onClick={()=>setPasswordOpen(true)}>Change password</button></div>}
    <div className="toolbar"><div className="period-buttons"><button onClick={()=>setPeriod('month')}>This month</button><button onClick={()=>setPeriod('year')}>This year</button><button onClick={()=>setPeriod('fy')}>Financial year</button><button onClick={()=>setPeriod('pastyear')}>Past year</button><button onClick={()=>setPeriod('all')}>All time</button></div><div className="toolbar-actions"><button className="secondary" onClick={downloadExcel}><FileSpreadsheet size={16}/> Excel</button><button className="secondary" onClick={downloadPDF}><FileText size={16}/> PDF</button><button className="primary" onClick={openAdd}><Plus size={17}/> Add entry</button></div></div>
    {page==='overview' && <>
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
    {userModalOpen && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setUserModalOpen(false)}><form className="modal-card" onSubmit={createUser}><div className="modal-head"><div><p className="eyebrow">FAMILY ACCOUNTS</p><h2>Add family member</h2><p className="muted">Create a login for a new family member. The temporary password must be changed at first sign-in.</p></div><button type="button" className="icon-button" onClick={()=>setUserModalOpen(false)}><X size={19}/></button></div><label>Full name<input autoComplete="off" value={newUserForm.username} onChange={e=>setNewUserForm(f=>({...f,username:e.target.value.toUpperCase()}))} minLength={2} maxLength={30} required placeholder="e.g. NEW MEMBER" /></label><label>Temporary password<input type="password" autoComplete="new-password" value={newUserForm.password} onChange={e=>setNewUserForm(f=>({...f,password:e.target.value}))} minLength={12} maxLength={128} required placeholder="At least 12 characters" /></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setUserModalOpen(false)}>Cancel</button><button className="primary">Create account <Check size={16}/></button></div></form></div>}
    {formOpen && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setFormOpen(false)}><form className="modal-card" onSubmit={saveEntry}><div className="modal-head"><div><p className="eyebrow">LEDGER ENTRY</p><h2>{editing?'Edit transaction':'Add transaction'}</h2><p className="muted">Saved with your account name and current date & time.</p></div><button type="button" className="icon-button" onClick={()=>setFormOpen(false)}><X size={19}/></button></div><div className="segmented"><button type="button" className={form.kind==='income'?'selected income-select':''} onClick={()=>setForm(f=>({...f,kind:'income'}))}><ArrowDownLeft size={16}/> Income</button><button type="button" className={form.kind==='expense'?'selected expense-select':''} onClick={()=>setForm(f=>({...f,kind:'expense'}))}><ArrowUpRight size={16}/> Expense</button></div><label>Category <span className="required">*</span><div className="category-options"><button type="button" className={form.category==='normal'?'category-option chosen':''} onClick={()=>setForm(f=>({...f,category:'normal'}))}><Wallet size={18}/><span><b>Normal</b><small>Default category</small></span>{form.category==='normal'&&<Check size={16}/>}</button><button type="button" className={form.category==='rental'?'category-option chosen rental-chosen':''} onClick={()=>setForm(f=>({...f,category:'rental'}))}><Home size={18}/><span><b>Rental</b><small>Separate balance</small></span>{form.category==='rental'&&<Check size={16}/>}</button></div></label><label>Amount (₹) <span className="required">*</span><div className="amount-input"><span>₹</span><input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} required/></div></label><label>Remark <span className="required">* Compulsory</span><textarea maxLength={500} rows={3} placeholder="Why is this entry being recorded?" value={form.remark} onChange={e=>setForm(f=>({...f,remark:e.target.value}))} required/><small className="field-hint">{form.remark.length}/500 characters</small></label><div className="auto-time"><Clock3 size={15}/><span>Current date & time will be recorded automatically.</span></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setFormOpen(false)}>Cancel</button><button className="primary" disabled={busy}>{editing?'Save changes':'Save entry'} <Check size={16}/></button></div></form></div>}
    {noteOpen && <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setNoteOpen(false)}><form className="modal-card" onSubmit={saveNote}><div className="modal-head"><div><p className="eyebrow">POST-EDIT SETTLEMENT</p><h2>Create debit note</h2><p className="muted">Record an adjustment without changing the locked original entry.</p></div><button type="button" className="icon-button" onClick={()=>setNoteOpen(false)}><X size={19}/></button></div><label>Related entry (optional)<select value={noteForm.originalEntryId} onChange={e=>{const selected=entries.find(x=>(x.id||x._id)===e.target.value);setNoteForm(f=>({...f,originalEntryId:e.target.value,...(selected?{category:selected.category}:{})}));}}><option value="">General settlement</option>{entries.filter(e=>e.username===user.username||user.role==='admin').map(e=><option key={e.id||e._id} value={e.id||e._id}>{dateTime(e.occurredAt)} · {e.username} · {money(e.amount)} · {e.remark.slice(0,45)}</option>)}</select></label><div className="form-two"><label>Category<select value={noteForm.category} onChange={e=>setNoteForm(f=>({...f,category:e.target.value}))}><option value="normal">Normal</option><option value="rental">Rental</option></select></label><label>Adjustment<select value={noteForm.direction} onChange={e=>setNoteForm(f=>({...f,direction:e.target.value}))}><option value="debit">Debit (reduces balance)</option><option value="credit">Credit (adds to balance)</option></select></label></div><label>Amount (₹)<div className="amount-input"><span>₹</span><input type="number" min="0.01" step="0.01" value={noteForm.amount} onChange={e=>setNoteForm(f=>({...f,amount:e.target.value}))} required placeholder="0.00"/></div></label><label>Settlement remark <span className="required">* Compulsory</span><textarea rows={3} maxLength={500} value={noteForm.remark} onChange={e=>setNoteForm(f=>({...f,remark:e.target.value}))} required placeholder="Explain the correction or settlement…"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setNoteOpen(false)}>Cancel</button><button className="primary">Save settlement <Check size={16}/></button></div></form></div>}
    {passwordOpen && <div className="modal-backdrop"><form className="modal-card password-modal" onSubmit={changePassword}><div className="modal-head"><div><p className="eyebrow">ACCOUNT SECURITY</p><h2>Change password</h2><p className="muted">Use a unique password with at least 12 characters.</p></div>{!user.mustChangePassword&&<button type="button" className="icon-button" onClick={()=>setPasswordOpen(false)}><X size={19}/></button>}</div><label>Current password<input type="password" autoComplete="current-password" value={pwForm.currentPassword} onChange={e=>setPwForm(f=>({...f,currentPassword:e.target.value}))} required/></label><label>New password<input type="password" autoComplete="new-password" minLength={12} value={pwForm.newPassword} onChange={e=>setPwForm(f=>({...f,newPassword:e.target.value}))} required/></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} value={pwForm.confirmPassword} onChange={e=>setPwForm(f=>({...f,confirmPassword:e.target.value}))} required/></label><div className="modal-actions"><button type="submit" className="primary full">Update password <Check size={16}/></button></div></form></div>}
    {toast&&<Toast toast={toast}/>}
  </div>;
}

function TransactionTable({ entries, currentUser, onEdit }) {
  return <div className="table-wrap"><table><thead><tr><th>DATE & TIME</th>{currentUser.role==='admin'&&<th>PERSON</th>}<th>TYPE</th><th>CATEGORY</th><th>AMOUNT</th><th>REMARK</th><th>EDIT</th></tr></thead><tbody>{entries.map(e=>{const id=e.id||e._id;const own=e.username===currentUser.username;const editable=own&&Date.now()-new Date(e.createdAt).getTime()<=3600000;return <tr key={id}><td><span className="date-cell">{dateTime(e.occurredAt)}</span></td>{currentUser.role==='admin'&&<td><span className="person-cell"><span className="mini-avatar">{e.username?.[0]}</span>{e.username}</span></td>}<td><span className={`type-pill ${e.kind}`}>{e.kind==='income'?<ArrowDownLeft size={13}/>:<ArrowUpRight size={13}/>} {e.kind}</span></td><td><span className={`category-pill ${e.category}`}>{e.category}</span></td><td className={e.kind==='income'?'amount-positive':'amount-negative'}>{e.kind==='income'?'+':'−'}{money(e.amount)}</td><td className="remark-cell" title={e.remark}>{e.remark}</td><td>{editable?<button className="icon-button" title="Edit entry (available for one hour)" onClick={()=>onEdit(e)}><Pencil size={15}/></button>:<span className="locked" title={own?'Edit window expired':'Only the creator can edit'}><LockKeyhole size={14}/></span>}</td></tr>})}{!entries.length&&<EmptyRow cols={currentUser.role==='admin'?7:6} message="No transactions found"/>}</tbody></table></div>;
}
function EmptyRow({cols,message}) { return <tr><td colSpan={cols}><div className="empty-state"><div><ReceiptText size={22}/></div><b>{message}</b><span>Try changing your filters or add a new entry.</span></div></td></tr>; }
function Toast({toast}) { return <div className={`toast ${toast.type==='error'?'toast-error':''}`} role="status"><span className="toast-icon">{toast.type==='error'?<X size={16}/>:<Check size={16}/>}</span>{toast.message}</div>; }

export default App;
