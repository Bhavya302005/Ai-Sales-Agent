-- Run this in your Supabase SQL Editor
-- Creates a table to track CSV campaign history

CREATE TABLE csv_campaign_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    csv_name TEXT NOT NULL,
    total_emails INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    job_title TEXT,
    status TEXT DEFAULT 'completed',
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE csv_campaign_history ENABLE ROW LEVEL SECURITY;

-- Allow users to manage only their own CSV campaign history
CREATE POLICY "Users can manage their own csv campaign history"
    ON csv_campaign_history FOR ALL USING (auth.uid() = user_id);
