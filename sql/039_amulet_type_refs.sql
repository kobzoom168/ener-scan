-- คลังพิมพ์พระ: admin-curated example images per amulet type. At scan time the
-- new photo's DINOv2 embedding is kNN-matched against CONFIRMED examples —
-- a strong match overrides the LLM classifier's label (กบ-approved > model guess).

create table if not exists public.amulet_types (
  type_key text primary key,
  label_thai text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.amulet_type_examples (
  id uuid primary key default gen_random_uuid(),
  type_key text not null references public.amulet_types (type_key) on delete cascade,
  embedding vector(384) not null,
  image_path text,
  source_baseline_id uuid,
  source text not null default 'upload',
  status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  constraint amulet_type_examples_source_check check (source in ('upload', 'library', 'suggested')),
  constraint amulet_type_examples_status_check check (status in ('confirmed', 'rejected'))
);

create index if not exists idx_amulet_type_examples_type on public.amulet_type_examples (type_key, status);
create index if not exists idx_amulet_type_examples_embedding
  on public.amulet_type_examples using ivfflat (embedding vector_cosine_ops) with (lists = 10);

-- kNN over confirmed examples of enabled types.
create or replace function public.match_amulet_type_examples(
  query_embedding vector(384),
  match_count integer default 8
)
returns table (
  example_id uuid,
  type_key text,
  label_thai text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.id as example_id,
    e.type_key,
    t.label_thai,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.amulet_type_examples e
  join public.amulet_types t on t.type_key = e.type_key and t.enabled
  where e.status = 'confirmed'
  order by e.embedding <=> query_embedding asc
  limit greatest(1, least(50, match_count));
$$;

grant all on table public.amulet_types to service_role;
grant all on table public.amulet_type_examples to service_role;
grant select, insert, update, delete on table public.amulet_types to web_anon;
grant select, insert, update, delete on table public.amulet_type_examples to web_anon;
grant execute on function public.match_amulet_type_examples(vector, integer) to service_role;
grant execute on function public.match_amulet_type_examples(vector, integer) to web_anon;

insert into public.amulet_types (type_key, label_thai) values
  ('somdej_ref', 'พระสมเด็จ'),
  ('nuea_phrom_ref', 'พระเหนือพรหม')
on conflict (type_key) do nothing;
