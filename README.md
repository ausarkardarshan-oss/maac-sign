# MAAC AI Sign — Full-Stack Document Signing Platform

A modern, secure full-stack electronic signature and document workflow platform built with a **React.js (Vite)** frontend and a **Node.js (Express + Mongoose / MongoDB)** backend.

---

## ✦ System Architecture

```text
maac-sign/
├── frontend/                     # React.js SPA (Vite)
│   ├── src/
│   │   ├── components/           # Layout, Modals, Toast notifications
│   │   ├── context/              # AuthContext (cookie-based session state)
│   │   ├── pages/                # Overview, Documents, Requests, Templates, SignForms, Reports, Settings, Public Sign
│   │   ├── services/             # API client (fetch wrapper with cookie credentials)
│   │   └── styles/               # Faithful replica of the original MAAC Sign design system
│   ├── vite.config.js            # Reverse proxy configuration (/api -> backend:3001)
│   └── package.json
│
├── backend/                      # Node.js API (Express)
│   ├── src/
│   │   ├── config/               # MongoDB connection (Mongoose) and env configuration
│   │   ├── models/               # Mongoose Models (User, Session, Document, Request, Recipient, Audit, Template, Form)
│   │   ├── middleware/           # Auth guard, rate limiters, error handler, security headers
│   │   ├── routes/               # Modular Express routers (auth, documents, signing, templates)
│   │   ├── services/             # Core business logic: hashing, token verification, audit trails
│   │   └── server.js             # Entry point
│   ├── storage/documents/        # Isolated document storage (hashed filenames outside public web root)
│   ├── tests/                    # Comprehensive E2E test suite running against MongoDB
│   └── package.json
│
├── scripts/
│   └── dev.js                    # Cross-platform concurrent dev orchestrator
├── package.json                  # Root developer scripts
└── README.md
```

---

## ✦ Prerequisites

- **Node.js**: >= 20.0
- **MongoDB**: MongoDB Community Server or MongoDB Atlas (viewable via MongoDB Compass on `127.0.0.1:27017`)
- **npm**: >= 10.0

---

## ✦ Quick Start

### 1. Install Dependencies

Install all dependencies for root, backend, and frontend with a single command:

```bash
npm run install:all
```

Or individually:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Environment Configuration

Copy the example environment files:

```bash
# In backend/
cp backend/.env.example backend/.env

# In frontend/
cp frontend/.env.example frontend/.env
```

Default development values:
- Backend port: `3001`
- Frontend port: `5173`
- Reverse proxy: `/api` -> `http://localhost:3001`

### 3. Run Development Servers

Start both the backend API and React frontend simultaneously with live hot-reloading:

```bash
npm run dev
```

- Frontend workspace: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:3001/api](http://localhost:3001/api)

Or run individually:
- Backend: `npm run dev:backend`
- Frontend: `npm run dev:frontend`

---

## ✦ Testing & Verification

Run the end-to-end automated test suite:

```bash
npm test
```

The test validates:
- User registration and login
- Secure session cookie creation and authentication
- PDF upload, metadata extraction, and SHA-256 integrity hashing
- Signing request creation with cryptographically secure recipient tokens
- Authorized recipient access and document download
- Typed/electronic signature capture and consent logging
- Append-only cryptographic SHA-256 audit trail generation
- Document completion workflow and state transition

To test production build:

```bash
npm run build
```

---

## ✦ Production Deployment

1. Build the React frontend:
   ```bash
   npm run build
   ```
2. Start the production backend server:
   ```bash
   npm start
   ```

---

## ✦ Security Highlights

- **Session Security**: HTTP-only, SameSite strict session cookies. No tokens or passwords stored in `localStorage`.
- **File Storage**: Uploaded PDFs stored outside the public document root with SHA-256 checksums. Downloads require owner session or valid recipient token.
- **Audit Trail**: Tamper-evident, hash-chained log (`previous_hash` + `entry_hash`) recording creation, review, and signing events.
- **Rate Limiting**: Brute-force protection on authentication and public signing endpoints.
- **Input Sanitization & Parameterized Queries**: All SQL executed via prepared statements.
