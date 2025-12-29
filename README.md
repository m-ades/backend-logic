# 275 Backend

Node.js/Express backend API for the 275 course management system.

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Update the `.env` file with your PostgreSQL credentials.

4. Start the development server:
```bash
npm run dev
```

Or start the production server:
```bash
npm start
```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /api/test-db` - Test database connection

## Database

This project uses PostgreSQL. Make sure PostgreSQL is running and the database specified in `.env` exists.


