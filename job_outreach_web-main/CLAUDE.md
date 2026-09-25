# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `npm run dev`
  - Runs Next.js dev server with webpack flag
  - Available at http://localhost:3000

- **Build for production**: `npm run build`
  - Creates optimized production build

- **Start production server**: `npm run start`
  - Runs the built application

- **Lint code**: `npm run lint`
  - Runs ESLint on all files

## Project Structure

### App Router (Next.js 13+)
- `app/layout.tsx` - Root layout with metadata and global styles
- `app/page.tsx` - Home page
- `app/dashboard/page.tsx` - Dashboard view
- `app/inbox/page.tsx` - Email inbox
- `app/outreach/page.tsx` - Outreach campaign manager
- `app/resume/page.tsx` - Resume upload and parsing
- `app/auto_agent/page.tsx` - Automated agent settings
- `app/stitch_dashboard.html` - Static analytics dashboard

### API Routes (`app/api/`)
- `resume/route.ts` - PDF resume parsing using Gemini AI
- `gmail/route.ts` - Send emails via Gmail API (requires OAuth token)
- `gmail/refresh/route.ts` - Refresh Google OAuth tokens
- `gmail/scan/route.ts` - Scan emails for tracking
- `track/route.ts` - Email open/click tracking endpoint
- `ai/route.ts` - Generate email content using Gemini AI

### Key Integrations
- **Supabase** (`lib/supabase.ts`): Database client for storing contacts, campaigns, tracking data
- **Gemini AI**: Used for resume parsing and email generation
- **Gmail API**: Used for sending emails via OAuth 2.0
- **Tailwind CSS**: Utility-first CSS framework for styling

### Environment Variables
Required `.env.local` variables:
- `GEMINI_API_KEY` - For Gemini AI API access
- Supabase credentials (typically `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Google OAuth credentials for Gmail integration

## Common Development Tasks

### Adding a New Page
1. Create folder under `app/` (e.g., `app/new-feature/`)
2. Add `page.tsx` file in that folder
3. Link from navigation or dashboard as needed

### Adding an API Endpoint
1. Create folder under `app/api/` (e.g., `app/api/new-endpoint/`)
2. Add `route.ts` file with HTTP method handlers (GET, POST, etc.)
3. Use `NextRequest` and `NextResponse` from `next/server`
4. Set `export const runtime = 'edge'` for edge-optimized routes

### Database Operations
- Import supabase client: `import { supabase } from '@/lib/supabase'`
- Use standard Supabase JS methods: `.select()`, `.insert()`, `.update()`, `.delete()`

### Styling
- Uses Tailwind CSS utility classes
- Custom CSS in `app/globals.css` and component-specific CSS modules
- Dark mode enabled by default (html class="dark")

## Important Notes
- API routes in `app/api/` use Edge Runtime for better performance
- All API routes return JSON responses with appropriate status codes
- Error handling should console.error details and return user-friendly messages
- File uploads (like resumes) should be handled as base64 data in API routes
- Authentication for Gmail routes expects Bearer token in Authorization header