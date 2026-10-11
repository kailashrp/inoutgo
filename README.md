# Ledger — Income & Expense Tracker

A lightweight dark-mode personal/team ledger built with React + Vite, Express, and MongoDB Atlas.

## Included features

- Dark responsive UI with lightweight transitions and three-second toast messages.
- Separate **Normal** and **Rental** balance summaries; each category tracks income, expenses, debit notes, and credit notes separately.
- Signup uses a name and password; names are normalized to uppercase. The first account must be KAILASH and becomes the administrator. Later users can sign up, and KAILASH can add family accounts from the admin panel.
- KAILASH is the only administrator. The admin can remove or restore member login access; old financial entries remain preserved for recordkeeping.
- Passwords are hashed with bcrypt. Passwords are never returned to the admin or frontend.
- Required remark, automatic server-side date/time, entry filters, amount sorting, date range, and person-wise sorting.
- One-hour edit window enforced by the API (not just the UI); only the entry creator can edit it.
- Debit/credit settlement notes for adjustments after the edit window, without rewriting the original entry.
- Excel (.xlsx) export with transaction and summary sheets; PDF transaction report export.
- Quick date filters: this month, calendar year, Indian financial year (1 April–31 March), previous calendar year, and all time.
- Admin user-wise Normal/Rental balances, transaction counts, settlement-note counts, and ability to filter entries by person.

## Requirements

- Node.js 20+ recommended
- A MongoDB Atlas account and database user
- Git installed if deploying from GitHub

## 1. Configure MongoDB Atlas

1. Create a project and a database deployment in [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Create a database user with a strong password.
3. In Network Access, allow the IP address of your backend host. For local development, add your current public IP. Avoid `0.0.0.0/0` unless you understand the risk and your credentials are strong.
4. Copy the Node.js connection string. Set the database name using `MONGODB_DB=income_expense`; the application passes this option to Mongoose even if the connection string itself has no database path.

## 2. Install and configure the backend

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and set:

- `MONGODB_URI`: your Atlas connection string
- `MONGODB_DB`: database name (default `income_expense`)
- `JWT_SECRET`: a long random secret (at least 32 characters)
- `FRONTEND_ORIGIN`: `http://localhost:5173` while developing

Generate a secret with Node.js, for example:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the first administrator using the app’s **Create account** screen. On a completely empty `income_expense` database, the first name must be `KAILASH`; choose a password of at least 12 characters. Do not run a seed script.

Start the API:

```bash
npm run dev
```

API should be available at `http://localhost:5000/api/health`.

## 3. Install and run the frontend

In a second terminal:

```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_URL=http://localhost:5000/api`.

```bash
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`).

## 4. Deployment

GitHub Pages hosts the frontend only. It cannot run the Express API or connect directly to MongoDB. Deploy the backend separately (for example, to a Node.js hosting service) and put the backend's public HTTPS API URL in the frontend build variable `VITE_API_URL`.

### Backend host

1. Create a Node.js web service from this repository and set its root directory to `backend`.
2. Build/install command: `npm install`; start command: `npm start`.
3. Add the environment variables from `backend/.env.example` in the host dashboard. Do not upload `.env` to Git.
4. Set `FRONTEND_ORIGIN` to your exact deployed frontend origin (e.g. `https://YOUR-USERNAME.github.io`). If you have multiple allowed origins, separate them with commas.
5. In Atlas Network Access, allow the backend host's outbound IP addresses according to the host's guidance.

### GitHub Pages frontend

1. Push this project to a GitHub repository.
2. In the repository settings, enable GitHub Pages with GitHub Actions (or use a Vite build workflow).
3. Set `VITE_API_URL` to your deployed API URL, e.g. `https://YOUR-API-HOST.example/api`, as a build-time environment variable.
4. Build from `frontend` with `npm ci` if a lockfile is present (otherwise `npm install`) and `npm run build`; publish the `frontend/dist` folder.
5. Make sure the API's `FRONTEND_ORIGIN` exactly matches the GitHub Pages origin.

For a custom domain, update the backend CORS origin to that domain too. GitHub Pages is not a private hosting service: authentication and API authorization protect the data, not a secret frontend URL.

## Important account and security notes

- On an empty database, the first signup must be KAILASH; that account becomes the admin. Do not expose this app publicly without additional invite/approval controls, because subsequent self-signup is enabled. For a family-only production app, consider disabling public signup after the family accounts are created.
- Never store or display plaintext passwords. Admins can see user summaries, not credentials.
- The first signup on a completely empty database must be KAILASH. Subsequent public signups create normal users; the admin can also add users directly. For public production use, add invite/approval controls or disable public signup after family accounts are created.
- Use HTTPS for production API hosting. Keep `.env` private and rotate secrets if they are exposed.
- The server records entry timestamps. The one-hour edit policy is checked server-side using the entry creation time.
- The initial implementation exports the currently loaded/filtered entries (maximum 5,000 returned by the API). For very large ledgers, add paginated exports or a server-generated report endpoint.
- The dashboard balance cards are lifetime balances; date filters control the transaction list and downloaded transaction report. Debit/credit notes affect the Normal or Rental balance as shown.

## Project layout

```text
income-expense-app/
├── backend/
│   ├── src/
│   │   ├── models.js
│   │   └── server.js
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── package.json
```


### Secrets

The local `backend/.env` file is ignored by Git. Never commit or publish it. If you received this project through a shared archive, replace the MongoDB database-user password and `JWT_SECRET` before production deployment.
