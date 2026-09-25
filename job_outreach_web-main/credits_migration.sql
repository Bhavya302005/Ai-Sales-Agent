-- ═══════════════════════════════════════════════════════════════
-- Job Mail Loop — Credits & Payment System Migration
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Add credits column to user_profiles (50 free credits for every user)
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 50;

-- 2. Add credits_expires_at column (1 year from signup)
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS credits_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 year');

-- 3. Set existing users who already have profiles to have 50 credits + 1 year expiry
UPDATE user_profiles 
  SET credits = 50, credits_expires_at = NOW() + INTERVAL '1 year'
  WHERE credits IS NULL;

-- 4. Create credit transaction log table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,           -- positive = add, negative = deduct
  balance_after INTEGER NOT NULL,    -- snapshot of balance after this transaction
  type TEXT NOT NULL,                 -- 'signup_bonus', 'generation', 'regeneration', 'purchase', 'refund', 'expired'
  description TEXT,
  razorpay_payment_id TEXT,          -- for purchase transactions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create payment orders table (for tracking Razorpay orders)
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_order_id TEXT UNIQUE NOT NULL,
  amount_paise INTEGER NOT NULL,     -- amount in paise (9900 = ₹99)
  credits INTEGER NOT NULL,          -- credits to add on success
  status TEXT DEFAULT 'created',     -- 'created', 'paid', 'failed'
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Enable RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
CREATE POLICY "Users can view their own credit transactions" 
  ON credit_transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credit transactions" 
  ON credit_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own payment orders" 
  ON payment_orders FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment orders" 
  ON payment_orders FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payment orders" 
  ON payment_orders FOR UPDATE USING (auth.uid() = user_id);

-- 8. Create an atomic credit deduction function (prevents race conditions)
CREATE OR REPLACE FUNCTION deduct_credit(p_user_id UUID, p_type TEXT, p_description TEXT)
RETURNS TABLE(success BOOLEAN, remaining_credits INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits INTEGER;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Lock the row to prevent concurrent deductions
  SELECT credits, credits_expires_at INTO v_credits, v_expires_at
  FROM user_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if credits have expired
  IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN
    RETURN QUERY SELECT false, 0, 'Credits have expired. Please purchase a new pack.'::TEXT;
    RETURN;
  END IF;

  -- Check if enough credits
  IF v_credits IS NULL OR v_credits <= 0 THEN
    RETURN QUERY SELECT false, COALESCE(v_credits, 0), 'Insufficient credits. Please purchase more.'::TEXT;
    RETURN;
  END IF;

  -- Deduct 1 credit
  UPDATE user_profiles
  SET credits = credits - 1
  WHERE user_id = p_user_id;

  -- Log the transaction
  INSERT INTO credit_transactions (user_id, amount, balance_after, type, description)
  VALUES (p_user_id, -1, v_credits - 1, p_type, p_description);

  RETURN QUERY SELECT true, v_credits - 1, 'Credit deducted successfully.'::TEXT;
END;
$$;

-- 9. Create function to add credits after purchase
CREATE OR REPLACE FUNCTION add_credits(p_user_id UUID, p_amount INTEGER, p_type TEXT, p_description TEXT, p_razorpay_payment_id TEXT DEFAULT NULL)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  -- Update credits and extend expiry by 1 year from now
  UPDATE user_profiles
  SET credits = COALESCE(credits, 0) + p_amount,
      credits_expires_at = GREATEST(COALESCE(credits_expires_at, NOW()), NOW()) + INTERVAL '1 year'
  WHERE user_id = p_user_id
  RETURNING credits INTO v_credits;

  -- Log the transaction
  INSERT INTO credit_transactions (user_id, amount, balance_after, type, description, razorpay_payment_id)
  VALUES (p_user_id, p_amount, v_credits, p_type, p_description, p_razorpay_payment_id);

  RETURN QUERY SELECT true, v_credits;
END;
$$;
