-- Run this in Supabase Dashboard > SQL Editor
-- This creates the admin user directly in the auth system

-- Step 1: Create user in auth.users
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'it@aerisbeaute.com',
  crypt('@Aerisbeaute123!', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"username": "itaeris", "name": "IT Aeris", "role": "admin"}'::jsonb,
  NOW(), NOW(), '', ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'it@aerisbeaute.com'
);

-- Step 2: Create identity (required for login)
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
SELECT
  u.id,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  NOW(), NOW(), NOW()
FROM auth.users u
WHERE u.email = 'it@aerisbeaute.com'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = u.id AND provider = 'email'
  );

-- Step 3: Ensure profile exists with admin role
-- (The trigger should handle this, but just in case)
INSERT INTO profiles (id, username, name, email, role)
SELECT id, 'itaeris', 'IT Aeris', 'it@aerisbeaute.com', 'admin'
FROM auth.users
WHERE email = 'it@aerisbeaute.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';
