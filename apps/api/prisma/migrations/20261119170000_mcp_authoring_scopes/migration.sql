ALTER TYPE public.api_token_scope ADD VALUE IF NOT EXISTS 'projects:read';
ALTER TYPE public.api_token_scope ADD VALUE IF NOT EXISTS 'cases:read';
ALTER TYPE public.api_token_scope ADD VALUE IF NOT EXISTS 'cases:write';
ALTER TYPE public.api_token_scope ADD VALUE IF NOT EXISTS 'policies:read';
ALTER TYPE public.api_token_scope ADD VALUE IF NOT EXISTS 'policies:write';
ALTER TYPE public.api_token_scope ADD VALUE IF NOT EXISTS 'policies:publish';
