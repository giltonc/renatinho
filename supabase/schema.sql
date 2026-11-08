-- =====================================================================
-- Controle de Pagamentos de Campanhas — esquema do banco (Supabase)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".
-- Pode ser executado de novo sem problemas (é idempotente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

-- Quem é administrador (usuários criados em Authentication > Users)
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Uma campanha = um nome, uma imagem e uma lista de pessoas
create table if not exists public.campanhas (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome       text not null check (length(trim(nome)) > 0),
  imagem_url text,
  created_at timestamptz not null default now()
);

-- Pessoas da campanha. "ativo" = entra automaticamente nos próximos meses
create table if not exists public.pessoas (
  id          uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists pessoas_campanha_idx on public.pessoas (campanha_id);

-- Meses de cada campanha
create table if not exists public.meses (
  id          uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  ano         int  not null check (ano between 2000 and 2100),
  mes         int  not null check (mes between 1 and 12),
  status      text not null default 'aberto' check (status in ('aberto', 'encerrado')),
  created_at  timestamptz not null default now(),
  unique (campanha_id, ano, mes)
);

-- Um pagamento = uma pessoa dentro de um mês (é a "lista do mês")
--   pendente -> ninguém enviou comprovante
--   enviado  -> comprovante enviado, aguardando o administrador (amarelo)
--   validado -> administrador conferiu e aprovou (verde)
create table if not exists public.pagamentos (
  id               uuid primary key default gen_random_uuid(),
  mes_id           uuid not null references public.meses(id) on delete cascade,
  pessoa_id        uuid not null references public.pessoas(id) on delete cascade,
  status           text not null default 'pendente' check (status in ('pendente', 'enviado', 'validado')),
  comprovante_path text,
  enviado_em       timestamptz,
  validado_em      timestamptz,
  created_at       timestamptz not null default now(),
  unique (mes_id, pessoa_id)
);
create index if not exists pagamentos_mes_idx on public.pagamentos (mes_id);

-- ---------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------

-- O usuário logado é administrador?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Pode enviar comprovante para este pagamento? (pendente e mês em aberto)
-- Recebe texto porque vem do nome da pasta do arquivo no Storage.
create or replace function public.pode_enviar_comprovante(p_pagamento text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_pagamento ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and exists (
       select 1
         from public.pagamentos p
         join public.meses m on m.id = p.mes_id
        where p.id = p_pagamento::uuid
          and p.status = 'pendente'
          and m.status = 'aberto'
     );
$$;

-- Chamado pelo site (sem login) depois de subir o arquivo.
-- Marca o pagamento como "enviado". Só funciona uma vez por pagamento.
create or replace function public.informar_pagamento(p_pagamento uuid, p_path text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_path is null or split_part(p_path, '/', 1) <> p_pagamento::text then
    raise exception 'Caminho do comprovante inválido';
  end if;

  if not exists (
    select 1 from storage.objects where bucket_id = 'comprovantes' and name = p_path
  ) then
    raise exception 'Arquivo do comprovante não encontrado';
  end if;

  update public.pagamentos p
     set status = 'enviado', comprovante_path = p_path, enviado_em = now()
    from public.meses m
   where p.id = p_pagamento
     and m.id = p.mes_id
     and p.status = 'pendente'
     and m.status = 'aberto';

  if not found then
    raise exception 'Este nome já tem comprovante ou o mês está encerrado';
  end if;
end;
$$;

-- Cria um mês já com todas as pessoas ativas da campanha (só admin)
create or replace function public.criar_mes(p_campanha uuid, p_ano int, p_mes int)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores';
  end if;

  insert into public.meses (campanha_id, ano, mes)
  values (p_campanha, p_ano, p_mes)
  returning id into v_id;

  insert into public.pagamentos (mes_id, pessoa_id)
  select v_id, id from public.pessoas where campanha_id = p_campanha and ativo;

  return v_id;
end;
$$;

revoke execute on function public.criar_mes(uuid, int, int) from public, anon;
grant  execute on function public.criar_mes(uuid, int, int) to authenticated;
grant  execute on function public.is_admin() to anon, authenticated;
grant  execute on function public.pode_enviar_comprovante(text) to anon, authenticated;
grant  execute on function public.informar_pagamento(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Segurança (Row Level Security)
-- Todo mundo pode LER campanhas, pessoas, meses e status dos pagamentos.
-- Só administradores podem ALTERAR qualquer coisa.
-- ---------------------------------------------------------------------
alter table public.admins     enable row level security;
alter table public.campanhas  enable row level security;
alter table public.pessoas    enable row level security;
alter table public.meses      enable row level security;
alter table public.pagamentos enable row level security;

drop policy if exists "admin ve admins" on public.admins;
create policy "admin ve admins" on public.admins
  for select to authenticated using (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['campanhas', 'pessoas', 'meses', 'pagamentos'] loop
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "admin altera" on public.%I', t);
    execute format('create policy "admin altera" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Visitantes não enxergam o caminho do arquivo do comprovante
revoke select on public.pagamentos from anon;
grant select (id, mes_id, pessoa_id, status, enviado_em, validado_em, created_at)
  on public.pagamentos to anon;

-- ---------------------------------------------------------------------
-- Storage (arquivos)
--   comprovantes -> PRIVADO. Qualquer um envia, só admin vê/apaga.
--   campanhas    -> PÚBLICO. Imagens das campanhas, só admin envia.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('comprovantes', 'comprovantes', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']),
  ('campanhas', 'campanhas', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "envio de comprovante" on storage.objects;
create policy "envio de comprovante" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'comprovantes'
    and public.pode_enviar_comprovante((storage.foldername(name))[1])
  );

drop policy if exists "admin le comprovantes" on storage.objects;
create policy "admin le comprovantes" on storage.objects
  for select to authenticated
  using (bucket_id in ('comprovantes', 'campanhas') and public.is_admin());

drop policy if exists "admin apaga arquivos" on storage.objects;
create policy "admin apaga arquivos" on storage.objects
  for delete to authenticated
  using (bucket_id in ('comprovantes', 'campanhas') and public.is_admin());

drop policy if exists "admin envia imagem de campanha" on storage.objects;
create policy "admin envia imagem de campanha" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'campanhas' and public.is_admin());

drop policy if exists "admin atualiza imagem de campanha" on storage.objects;
create policy "admin atualiza imagem de campanha" on storage.objects
  for update to authenticated
  using (bucket_id = 'campanhas' and public.is_admin());
