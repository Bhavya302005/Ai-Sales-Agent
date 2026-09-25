-- ═══════════════════════════════════════════════════════════════
-- Job Mail Loop — Onboarding Migration
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Add onboarding_completed column to user_profiles
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- 2. Auto-mark existing users who already have a full_name as onboarded
-- so they skip the onboarding flow entirely
UPDATE user_profiles 
  SET onboarding_completed = TRUE 
  WHERE full_name IS NOT NULL AND full_name != '';

-- 3. Ensure all profile columns exist (some may already exist)
-- These are safe to run — IF NOT EXISTS prevents errors on duplicates
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS github_url TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS portfolio_url TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS current_title TEXT;
