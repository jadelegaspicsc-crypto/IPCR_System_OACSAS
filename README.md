# CSC IPCR Online System v3

A static Netlify-ready IPCR application using Supabase Authentication + PostgreSQL + Row Level Security.

## What changed from v2

v2 used a prototype/demo login. v3 uses real Supabase Authentication, so the login works with actual email/password accounts created in Supabase.

Included:
- Real email/password login and logout
- Password reset
- Employee / Supervisor / Head of Office / Administrator roles
- Employee IPCR dashboard
- IPCR creation and editing
- Core 60%, Strategic 30%, Support 10% structure
- Q / E / T ratings on a 1–5 scale
- Automatic average and weighted-rating calculation
- Draft → For Review → For Approval → Approved workflow
- Supervisor/team review queue
- Administrator user-role management
- Audit trail
- Supabase Row Level Security
- Netlify-compatible static deployment
- No build process required

## Important security rule

Do NOT put a Supabase `service_role` or secret key in this project.

The browser should contain only:
- Supabase Project URL
- Supabase anon/public key (or publishable key)

The database is protected by RLS policies in `supabase.sql`.

---

# STEP 1 — Create a Supabase project

1. Open Supabase.
2. Create a new project.
3. Wait until the database is ready.
4. Open **SQL Editor**.

# STEP 2 — Run the SQL setup

1. Open `supabase.sql` from this ZIP.
2. Copy the entire file.
3. Paste it into Supabase SQL Editor.
4. Click **Run**.
5. Confirm that the tables were created:
   - profiles
   - ipcrs
   - ipcr_items
   - ipcr_audit
   - ipcr_review_queue view

# STEP 3 — Create your first Administrator account

This is the important part that fixes the v2 login problem.

1. In Supabase, open **Authentication → Users**.
2. Click **Add user** / **Create user**.
3. Enter your actual work email address.
4. Set a strong password.
5. Create the user.
6. Copy the user's **UUID**.

Then go to **SQL Editor** and run:

```sql
update public.profiles
set
  role = 'admin',
  full_name = 'YOUR FULL NAME',
  active = true
where id = 'PASTE-THE-USER-UUID-HERE';
```

Verify:

```sql
select id, email, full_name, role, active
from public.profiles
order by created_at;
```

You should see your account with:

```text
role = admin
active = true
```

## Why this extra step is required

Supabase Authentication stores the login account. The `profiles` table stores the application's employee information and role.

New accounts automatically receive a `profiles` record with the default role:

```text
employee
```

You manually change your first account to:

```text
admin
```

After that, you can use the Administrator screen to manage roles.

---

# STEP 4 — Get your Supabase browser credentials

In Supabase open:

**Project Settings → API**

Copy:

1. Project URL
2. anon/public key (or publishable key)

Do NOT copy the service_role/secret key.

---

# STEP 5 — Configure the website

Open:

```text
config.js
```

Replace:

```js
window.IPCR_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_ANON_OR_PUBLISHABLE_KEY"
};
```

with your actual values.

Example:

```js
window.IPCR_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

Save the file.

---

# STEP 6 — Deploy to Netlify

Because this is a static application, no Node.js build is required.

### Option A — Netlify drag and drop

1. Make sure these files are in the same folder:
   - index.html
   - styles.css
   - app.js
   - config.js
   - supabase.sql
   - README.md
2. ZIP the folder if needed, or use the folder contents.
3. Open your Netlify site.
4. Deploy the updated project.
5. Open the Netlify URL.

### Option B — GitHub

Upload the project to a GitHub repository and connect the repository to Netlify.

Build command:

```text
leave blank
```

Publish directory:

```text
.
```

---

# STEP 7 — Login

Use the email and password you created in:

**Supabase → Authentication → Users**

There is no default v3 username/password.

Your login is the actual Supabase account.

---

# STEP 8 — Create employee accounts

For each employee:

1. Supabase → Authentication → Users
2. Create the user's email/password.
3. The database trigger automatically creates the profile.
4. Open the IPCR application as Administrator.
5. Go to **User Administration**.
6. Change the user's role:
   - Employee
   - Supervisor
   - Head of Office
   - Administrator

You can also set employee number, position, office, and supervisor directly in the `profiles` table.

Example:

```sql
update public.profiles
set
  employee_no = '2026-001',
  position_title = 'Human Resource Specialist',
  office = 'OACSAS',
  supervisor_id = 'SUPERVISOR-UUID-HERE'
where email = 'employee@agency.gov.ph';
```

---

# IPCR workflow

Employee:

```text
Draft
  ↓
For Review
```

Supervisor:

```text
For Review
  ↓
For Approval
```

Head of Office / Administrator:

```text
For Approval
  ↓
Approved
```

An approved IPCR should be treated as locked for ordinary employee editing.

---

# IPCR calculation

Each indicator can have:

- Quality (Q)
- Efficiency (E)
- Timeliness (T)
- Weight

Average:

```text
(Q + E + T) / number of ratings entered
```

Weighted rating:

```text
Average Rating × Weight
```

Final rating:

```text
SUM of all weighted ratings
```

The application displays the Core / Strategic / Support allocation and checks that total weight does not exceed 100%.

The supplied workbook's second and third worksheets were used as the structural reference for the IPCR form, including the Output/Outcome, Success Indicators, Actual Accomplishments, Q/E/T rating fields, weights, remarks, and semester structure.

---

# Localhost testing

If Python is installed:

```bash
python -m http.server 5500
```

Then open:

```text
http://localhost:5500
```

The same Supabase backend is used for localhost and Netlify.

---

# Troubleshooting

## "Supabase is not configured"

Check `config.js`.

Make sure you replaced both:

```text
YOUR-PROJECT
YOUR_ANON_OR_PUBLISHABLE_KEY
```

## "Invalid login credentials"

The email/password must exist under:

Supabase → Authentication → Users

The account must also have a profile.

Run:

```sql
select id,email,full_name,role,active
from public.profiles;
```

## Login succeeds but the app says profile cannot be loaded

Run `supabase.sql` again, especially the `profiles` table and `on_auth_user_created` trigger.

For an existing user, manually create the profile if necessary:

```sql
insert into public.profiles(id,email,full_name,role)
select id,email,email,'employee'
from auth.users
where email='employee@agency.gov.ph'
on conflict (id) do nothing;
```

## Administrator screen is missing

Check:

```sql
select email, role, active
from public.profiles;
```

Your account must have:

```text
role = admin
active = true
```

## Do not use the service_role key

Never paste a service_role/secret key into `config.js`, GitHub, Netlify, or browser JavaScript.

---

# Recommended production hardening

Before official agency-wide deployment:

1. Require strong passwords.
2. Enable MFA if appropriate for your Supabase plan and agency policy.
3. Configure the production site URL in Supabase Authentication URL settings.
4. Configure an agency-approved SMTP provider for password reset emails.
5. Review RLS policies with your ICT/security team.
6. Add formal approval/signature controls if electronic signatures are required.
7. Back up the database.
8. Conduct security/VAPT testing before production use.
9. Add the exact CSC-approved IPCR template/print layout if the official paper form must be reproduced pixel-for-pixel.

This v3 is intended as the working application foundation; the official CSC policy, security, records-management, and electronic-signature requirements should govern final production configuration.
