-- Run this in your Supabase SQL Editor to add self-open detection columns
-- These columns help the tracking server distinguish sender vs recruiter opens

-- 1. Add first_open_ip — stores the IP of the first pixel hit (likely the sender)
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS first_open_ip TEXT;

-- 2. Add sender_ip — stores the sender's IP at the time of sending (optional, for extra protection)
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS sender_ip TEXT;

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'email_history' 
AND column_name IN ('first_open_ip', 'sender_ip');
