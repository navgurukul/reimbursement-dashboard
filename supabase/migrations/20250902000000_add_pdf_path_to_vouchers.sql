-- Add pdf_path column to vouchers to store uploaded PDF location in storage
alter table if exists public.vouchers
  add column if not exists pdf_path text;

-- Optional: index for quicker lookups by expense
create index if not exists idx_vouchers_pdf_path on public.vouchers(pdf_path);

