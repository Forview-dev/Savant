# Savant

A **static, browser-based dashboard** for managing and viewing company Standard Operating Procedures (SOPs).  
SOPs are written in **Markdown**, searchable by title, team, category, and tags, and viewable in a dashboard-style interface.

---

# 🗂️ Savant Roadmap

## 1. Project Overview

The app will be built using:

- **Node.js + Express** for the backend
- **PostgreSQL** for structured data
- **HTML, CSS (Grid), and Vanilla JavaScript** for the frontend

Deployment will be handled through **separate Render services** for frontend and backend,  
with **GitHub integration for CI/CD**.

---

## 2. Architecture Decisions

### Frontend

- Built with **HTML**, **CSS Grid**, and **Vanilla JS**
- Organized in modular structure (components, utils, views)
- Lightweight and easy to maintain

### Backend

- **Node.js** with **Express** for RESTful APIs
- Handles authentication, database operations, and SOP management

### Database

- **PostgreSQL** hosted on Render
- Stores users, SOPs, and metadata

### Authentication

- **Magic-link system**
  - No password storage
  - Login link sent via email
  - Token verification handled on backend

### Deployment

- **Two Render services** (frontend + backend)
- Environment variables for database URL, email credentials, etc.

### CI/CD

- **GitHub → Render auto-deployment**
- Automatic deployment on push to `main`

---

## 3. Core Features

- 🔐 Authentication via **magic-link**
- 👤 User roles (**Admin / Editor / Reader**)
- 📜 SOP list view with **filtering and search**
- ✍️ SOP **creation/editing** with **Quill rich-text editor**
- 🕒 SOP **version history (basic)**
- 🌗 Optional dark/light mode toggle
- ⚙️ Secure backend **REST API**

---

## 4. Data Models (Simplified)

### User

| Field      | Type                               | Description               |
| ---------- | ---------------------------------- | ------------------------- |
| id         | UUID                               | Primary key               |
| name       | String                             | User’s display name       |
| email      | String                             | Used for magic link login |
| role       | Enum (`admin`, `editor`, `reader`) | Access level              |
| created_at | Timestamp                          | Account creation date     |

### SOP

| Field      | Type        | Description                            |
| ---------- | ----------- | -------------------------------------- |
| id         | UUID        | Primary key                            |
| title      | String      | SOP title                              |
| content    | Text (HTML) | SOP body stored as HTML                |
| category   | String      | SOP category (e.g. Quality, Inventory) |
| author_id  | UUID        | Linked to User                         |
| created_at | Timestamp   | Creation date                          |
| updated_at | Timestamp   | Last modification                      |

> 🔸 No password fields (magic link only)  
> 🔸 No attachments table (file storage disabled for now)

---

## 5. Backend API Plan

| Method   | Endpoint                 | Description                            |
| -------- | ------------------------ | -------------------------------------- |
| `POST`   | `/auth/magic-link`       | Send login email with magic link       |
| `GET`    | `/auth/verify?token=xyz` | Verify login link and generate session |
| `GET`    | `/sops`                  | Fetch list of all SOPs                 |
| `GET`    | `/sops/:id`              | Get single SOP details                 |
| `POST`   | `/sops`                  | Create a new SOP                       |
| `PUT`    | `/sops/:id`              | Update an SOP                          |
| `DELETE` | `/sops/:id`              | Delete an SOP (admin only)             |

---

## 6. Technical Stack Choices

- **Backend**Ò

  - Node.js + Express
  - `pg` npm package for PostgreSQL queries
  - `nodemailer` for sending magic links
  - `jsonwebtoken (JWT)` for secure session tokens

- **Frontend**
  - Quill.js as the rich-text editor
  - Vanilla JS modules for interactivity
  - CSS Grid for layout structure

---

## 7. Development Phases

### **Phase 1 – Setup & AuthenticationÒ**

- Initialize GitHub repo and CI/CD pipeline
- Setup Node.js + Express + PostgreSQL
- Implement magic link authentication flow

### **Phase 2 – Core Functionality**

- Implement CRUD routes for SOPs
- Integrate Quill editor on frontend
- Build frontend layout using CSS Grid

### **Phase 3 – Polish & Deployment**

- UI/UX improvements and error handling
- Add search and filter features
- Test and deploy to Render

---

## 8. Future Enhancements (Post-MVP)

- 📎 File attachments (S3 or Render Disk)
- 💬 Comments and collaborative editing
- 🧾 Advanced permissions and audit logs
- 📄 Export SOPs to Markdown or PDF

---

## ✅ Summary

| Category   | Choice                      |
| ---------- | --------------------------- |
| Frontend   | HTML, CSS Grid, Vanilla JS  |
| Backend    | Node.js with Express        |
| Database   | PostgreSQL                  |
| Auth       | Magic link via email        |
| Editor     | Quill.js                    |
| Deployment | Render (backend) + Cloudflare Pages (frontend) |
| CI/CD      | GitHub auto-deploy          |

---

## 🚀 Production Deployment

### Backend (Render Web Service)

Configure the Render service in `render.yaml` or via the dashboard with the
following environment variables:

| Variable              | Description                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`        | Render-managed PostgreSQL connection string                      |
| `APP_BASE_URL`        | Public URL of the backend (e.g. `https://savant-backend.onrender.com`) |
| `FRONTEND_ORIGINS`    | Comma or space separated list of allowed frontend origins        |
| `JWT_SECRET`          | Secret used to sign session tokens                               |
| `COOKIE_SECURE`       | `true` in production to set Secure cookies                       |
| `COOKIE_SAMESITE`     | `none` for cross-origin requests from Cloudflare Pages            |
| `DB_SSL`              | `true` when using Render PostgreSQL                              |
| `DB_DISABLE_IPV6`     | `true` to prefer IPv4 when connecting to the database            |
| `SMTP_HOST` (optional)| SMTP host for production magic-link email delivery               |
| `SMTP_*` (optional)   | `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_FROM` |

> ⚠️ `FRONTEND_ORIGINS` accepts wildcards (e.g. `https://*.pages.dev`) and determines which
> origins are allowed by CORS while keeping cookies enabled for authenticated requests.

### Frontend (Cloudflare Pages)

Deploy the `frontend` directory to Cloudflare Pages. The bundled
`_worker.js` serves `/env.js`, which injects runtime configuration. Define the
following environment variables in the Pages project:

| Variable         | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `API_BASE_URL`   | Public URL of the Render backend                         |
| `FRONTEND_ORIGIN`| (Optional) Explicit frontend origin exposed to the worker |
| `APP_ENV`        | (Optional) Environment label shown in telemetry/config   |

The static `public/env.js` file keeps local development working by defaulting
to `http://localhost:4000` when Cloudflare-provided values are absent.
