# Local Development Setup

## Prerequisites

- **Node.js** 18+ (recommended: latest LTS)
- **npm** (bundled with Node.js)
- A **PostgreSQL** database — [Neon](https://neon.tech) free tier works great

## Getting Started

```bash
# Clone the repository
git clone <repo-url>
cd Shadow-Hunt

# Install dependencies
npm install
```

## Environment Setup

Copy the example env file and fill in your database connection string:

```bash
cp .env.example .env
```

Edit `.env` with your Neon (or local Postgres) connection string:

```env
DATABASE_URL="postgresql://user:password@ep-your-endpoint.us-east-2.aws.neon.tech/dbname?sslmode=require"
```

For Neon, you can find the full connection string in the Neon dashboard under your project's connection details.

## Database Setup

Generate the Prisma client and run migrations:

```bash
# Generate Prisma client types
npx prisma generate

# Apply database migrations
npx prisma migrate dev
```

To view your database in a browser-based GUI:

```bash
npx prisma studio
```

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Running Tests

```bash
npm test
```

This runs the Vitest test suite (unit tests and property-based tests via fast-check).

## Troubleshooting

### Neon SSL connection errors

If you see `error: SSL/TLS required` or connection refused errors, make sure your `DATABASE_URL` includes `?sslmode=require` at the end:

```env
DATABASE_URL="postgresql://...@ep-your-endpoint.neon.tech/dbname?sslmode=require"
```

### `@prisma/client` not found or types missing

After pulling new schema changes, regenerate the Prisma client:

```bash
npx prisma generate
```

This outputs the client to `app/generated/prisma/` as configured in `schema.prisma`.

### Migration drift or pending migrations

If you see schema drift warnings:

```bash
# Reset the database and re-apply all migrations (destroys data)
npx prisma migrate reset

# Or apply pending migrations without reset
npx prisma migrate dev
```

### PowerShell execution policy on Windows

If you get a script execution policy error when running npm scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then restart your terminal.

### Port 3000 already in use

Kill the process using the port or run on a different port:

```bash
npm run dev -- --port 3001
```
