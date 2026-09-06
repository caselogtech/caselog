ALTER TYPE public.api_token_scope ADD VALUE IF NOT EXISTS 'candidates:write';
ALTER TYPE public.api_token_scope ADD VALUE IF NOT EXISTS 'readiness:read';
ALTER TYPE public.api_token_scope ADD VALUE IF NOT EXISTS 'readiness:write';
