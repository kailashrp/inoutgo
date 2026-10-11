# Before using real financial records

- [ ] Set a unique random `JWT_SECRET` (32+ characters).
- [ ] Add only the necessary IP addresses to MongoDB Atlas Network Access.
- [ ] Deploy the API with HTTPS and set `FRONTEND_ORIGIN` to the exact frontend origin.
- [ ] Set `VITE_API_URL` before building the frontend for production.
- [ ] Verify that KAILASH is the only account with the `admin` role.
- [ ] Test that one user cannot edit another user's entries or view their private records through the API.
- [ ] Test the one-hour edit restriction and debit/credit note calculations.
- [ ] Download and inspect both Excel and PDF reports.
- [ ] Back up your Atlas database and decide who is responsible for account recovery.

- [ ] Rotate any MongoDB password or JWT secret that was shared, uploaded, or included in a local archive before deploying publicly.
- [ ] Set `MONGODB_DB=income_expense` in the backend host environment.
