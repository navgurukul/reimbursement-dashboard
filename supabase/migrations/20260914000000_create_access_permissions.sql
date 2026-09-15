-- Create the access_permissions table
CREATE TABLE IF NOT EXISTS public.access_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  feature text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(org_id, email, feature)
);

-- Enable RLS
ALTER TABLE public.access_permissions ENABLE ROW LEVEL SECURITY;

-- Read policy: organization members can read access permissions
CREATE POLICY "Organization members can read access permissions"
  ON public.access_permissions FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM public.organization_users 
      WHERE organization_users.org_id = access_permissions.org_id
    )
  );

-- Insert policy: only owners and admins can insert
CREATE POLICY "Only owners and admins can insert access permissions"
  ON public.access_permissions FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id 
      FROM public.organization_users 
      WHERE organization_users.org_id = access_permissions.org_id
      AND organization_users.role IN ('owner', 'admin')
    )
  );

-- Delete policy: only owners and admins can delete
CREATE POLICY "Only owners and admins can delete access permissions"
  ON public.access_permissions FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id 
      FROM public.organization_users 
      WHERE organization_users.org_id = access_permissions.org_id
      AND organization_users.role IN ('owner', 'admin')
    )
  );
