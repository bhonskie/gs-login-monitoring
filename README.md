# GS Log In/Log Out Monitoring System

**Media Track — Information Logistics System**

A fullstack employee attendance monitoring system built with Next.js (App Router), PostgreSQL, and Drizzle ORM.

## Features

- **Clock In/Out Terminal** — Real-time shift tracking with expected duty windows (12:00 am–8:00 am, 2:00 am–10:00 am, 3:00 am–11:00 am)
- **Break Management** — Coffee & Meal breaks with duration rules, violations, and live countdown
- **OT, Undertime & Late Detection** — Auto-calculated based on fixed duty schedule
- **Attendance Reports** — Daily, Weekly, Monthly, Custom range with Excel (.xlsx) export
- **Employee Directory** — Levels (A–D), Positions (Plotter, ECG, QC, Adbust, Page Checker), Day-off checkboxes
- **Remarks Calendar** — Mark daily remarks per employee (Vacation Leave, Sick Leave, Emergency Leave, etc.)
- **Attendance Violations** — 3 consecutive absences → auto Warning Notice + Gmail email; 4 → auto Account Lock
- **Admin Portal** — Secure login/register, admin-only tabs, audit trail, unlock locked accounts
- **Security** — Employees can only view their own records; PINs verified server-side

## GS Team Leaders

- **Bonnie Lofranco Patio** — bonnie.patio@mediatrack.org
- **Thomas Jayson Lorenzo** — thomas.lorenzo@mediatrack.org
- **Marivel Noquillo** — marivel.noquillo@mediatrack.org

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, Lucide React icons
- **Backend**: Next.js App Router API routes, Drizzle ORM
- **Database**: PostgreSQL
- **Email**: Gmail SMTP (nodemailer) + Gmail Web Compose fallback
- **Export**: xlsx (SheetJS)

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/gs-login-monitoring.git
   cd gs-login-monitoring
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your DATABASE_URL and SMTP credentials
   ```

4. Push database schema:
   ```bash
   npx drizzle-kit push
   ```

5. Run development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Default Admin Login

On first run, a bootstrap admin account is created automatically:
- **Username**: admin
- **Password**: admin123

Change this immediately after first login via the Register tab in the Admin Portal.

## Environment Variables

See `.env.example` for all configuration options.

## License

Private — Media Track Information Logistics System
