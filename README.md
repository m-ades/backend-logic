# 275 Backend

Node.js/Express backend API for the Philo 275 Open Logic Project.

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create an `.env` file with your PostgreSQL credentials.

3. Start the development server:
```bash
npm run dev
```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /api/test-db` - Test database connection

## Database

This project uses PostgreSQL. Make sure PostgreSQL is running and the database specified in `.env` exists.


