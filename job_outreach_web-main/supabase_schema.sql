-- Run this in your Supabase SQL Editor

-- 1. Create table for Single and CSV Emails
CREATE TABLE email_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    company TEXT,
    job_title TEXT,
    recruiter_email TEXT,
    status TEXT,
    message_id TEXT,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create table for Bulk BCC History
CREATE TABLE bcc_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    subject TEXT,
    recipient_count INTEGER,
    status TEXT,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create table for Scanned Replies
CREATE TABLE scanned_replies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message_id TEXT,
    sender_name TEXT,
    sender_email TEXT,
    subject TEXT,
    category TEXT,
    summary TEXT,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create table for User Profiles (Stores Resume)
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    resume_text TEXT,
    resume_base64 TEXT,
    experience_level TEXT,
    default_tone_style TEXT,
    default_job_type TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on Row Level Security (RLS) so users can only see their own data
ALTER TABLE email_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bcc_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE scanned_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create Policies to allow users to read/write ONLY their own rows
CREATE POLICY "Users can manage their own email history" ON email_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own bcc history" ON bcc_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own scanned replies" ON scanned_replies FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own profile" ON user_profiles FOR ALL USING (auth.uid() = user_id);
