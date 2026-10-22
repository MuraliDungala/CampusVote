# CampusVote Frontend Application

The frontend client for CampusVote is a modern, responsive Single Page Application (SPA) built with React 18, TypeScript, Vite, Tailwind CSS, and Lucide React icons.

## Brand Identity & Aesthetic
* **Primary Deep Navy:** `#071D38`
* **Primary Blue:** `#2563EB`
* **Accent Cyan:** `#0284C7`
* **Background:** `#F8FAFC`
* **Typography:** `Inter` (Google Fonts)

## Prerequisites
* Node.js v18+ or v20+ (tested on Node v25)
* npm v9+ (tested on npm v11)

## Setup & Running Locally

1. **Install Dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start Development Server:**
   ```bash
   npm run dev
   ```
   The application runs on `http://localhost:5173`. API calls to `/api` are automatically proxied to the backend at `http://127.0.0.1:8000`.

3. **Run Automated Vitest Suite:**
   ```bash
   npm run test
   ```

4. **Build Production Assets:**
   ```bash
   npm run build
   ```

## Routes Implemented
* `/` - Public Landing Page with security overview, feature pillars, and lifecycle steps.
* `/elections` - Public catalog of active and scheduled elections.
* `/login` - Multi-Factor Authentication placeholder (Phase 4).
* `/student/dashboard` - Student eligibility and voter dashboard placeholder (Phase 1/4).
* `/admin/dashboard` - Election administrator console placeholder (Phase 1/3).
