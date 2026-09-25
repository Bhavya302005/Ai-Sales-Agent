-- ============================================
-- STEP 1: Apna user_id check karo (optional)
-- ============================================
-- SELECT id, email FROM auth.users;

-- ============================================
-- STEP 2: Apna sara scanned_replies data saaf karo
-- ============================================
DELETE FROM scanned_replies;

-- ============================================
-- STEP 3 (ONE TIME): message_id pe UNIQUE constraint lagao
-- taaki future me duplicate rows bane hi nahi
-- ============================================
ALTER TABLE scanned_replies
  ADD CONSTRAINT scanned_replies_message_id_user_id_unique 
  UNIQUE (user_id, message_id);
