-- Abalma pre-launch migration: run once in Supabase SQL Editor on an existing project.
-- Adds versioned terms acceptance, account moderation, and an unpaid booking lifecycle.

create table if not exists public.terms_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, terms_version)
);
alter table public.terms_acceptances enable row level security;
drop policy if exists terms_acceptances_read_own on public.terms_acceptances;
create policy terms_acceptances_read_own on public.terms_acceptances for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;

alter table public.profiles add column if not exists suspended boolean not null default false;
alter table public.profiles add column if not exists identity_status text not null default 'unverified'
  check (identity_status in ('unverified','pending','verified','rejected'));
alter table public.profiles add column if not exists identity_submitted_at timestamptz;
update public.profiles set verified = false where identity_status = 'unverified';

create table if not exists public.identity_documents (
  user_id uuid not null references public.profiles(id) on delete cascade,
  side text not null check (side in ('front','back')),
  storage_path text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, side),
  check (storage_path like (user_id::text || '/%'))
);
alter table public.identity_documents enable row level security;
drop policy if exists identity_documents_read on public.identity_documents;
create policy identity_documents_read on public.identity_documents for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists identity_documents_write on public.identity_documents;
create policy identity_documents_write on public.identity_documents for all to authenticated
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.identity_status in ('unverified','rejected')))
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.identity_status in ('unverified','rejected')));
drop policy if exists identity_documents_admin_delete on public.identity_documents;
create policy identity_documents_admin_delete on public.identity_documents for delete to authenticated using (public.is_admin());
revoke all on public.identity_documents from public, anon;
grant select, insert, update, delete on public.identity_documents to authenticated;

-- Keep privileged profile fields writable only by trusted database functions.
revoke update on public.profiles from authenticated, anon;
grant update (first_name, last_name, quartier, job) on public.profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('identity-documents','identity-documents',false,8388608,array['image/jpeg','image/png','application/pdf']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists identity_documents_storage_read on storage.objects;
create policy identity_documents_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'identity-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists identity_documents_storage_insert on storage.objects;
create policy identity_documents_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'identity-documents' and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.identity_status in ('unverified','rejected')));
drop policy if exists identity_documents_storage_delete on storage.objects;
create policy identity_documents_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'identity-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create or replace function public.submit_identity_documents() returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Connectez-vous pour envoyer votre pièce d’identité.'; end if;
  if public.is_suspended() then raise exception 'Ce compte est temporairement suspendu.'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user and p.identity_status in ('unverified','rejected')) then
    raise exception 'Une vérification est déjà en cours ou votre identité est déjà vérifiée.';
  end if;
  if (select count(*) from public.identity_documents d where d.user_id = v_user and d.side in ('front','back')) <> 2 then
    raise exception 'Ajoutez le recto et le verso de votre pièce d’identité.';
  end if;
  update public.profiles set identity_status = 'pending', identity_submitted_at = now() where id = v_user;
end $$;
grant execute on function public.submit_identity_documents() to authenticated;

create or replace function public.admin_set_identity_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l’administrateur.'; end if;
  if p_status not in ('verified','rejected') then raise exception 'Décision de vérification invalide.'; end if;
  if p_status = 'verified' and (select count(*) from public.identity_documents d where d.user_id = p_user) <> 2 then
    raise exception 'Les deux faces de la pièce doivent être disponibles pour la vérification.';
  end if;
  update public.profiles set identity_status = p_status, verified = (p_status = 'verified') where id = p_user;
end $$;
grant execute on function public.admin_set_identity_status(uuid,text) to authenticated;

create or replace function public.is_suspended() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.suspended from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.is_suspended() from public, anon;
grant execute on function public.is_suspended() to authenticated;

-- Keep private profile fields behind RLS while exposing only display fields to listing visitors.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin() or exists (
    select 1 from public.bookings b where
    ((b.borrower_id = auth.uid() and public.profiles.id = b.owner_id) or (b.owner_id = auth.uid() and public.profiles.id = b.borrower_id))
  )
);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and not public.is_suspended())
  with check (id = auth.uid() and not public.is_suspended());
create or replace view public.public_profiles with (security_barrier = true) as
  select id, first_name, last_name, verified, owner_rentals, owner_rating, owner_reviews, job
  from public.profiles;
revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;

create or replace function public.accept_current_terms() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connectez-vous pour accepter les conditions.'; end if;
  insert into public.terms_acceptances(user_id, terms_version, accepted_at)
  values (auth.uid(), '2026-10-19-v1', now())
  on conflict (user_id, terms_version) do nothing;
end $$;
grant execute on function public.accept_current_terms() to authenticated;

drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_suspended() and is_demo = false and status in ('online','paused') and cardinality(photos) between 3 and 5);
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated
  using (owner_id = auth.uid() and not public.is_suspended() and status <> 'hidden')
  with check (owner_id = auth.uid() and not public.is_suspended() and is_demo = false and status in ('online','paused') and cardinality(photos) between 3 and 5);
drop policy if exists lp_write on public.listing_private;
create policy lp_write on public.listing_private for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()) and not public.is_suspended())
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()) and not public.is_suspended());

update storage.buckets set public = true, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'photos';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('photos','photos',true,8388608,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_suspended());

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_version text; v_accepted timestamptz; v_provider text; v_full_name text;
begin
  v_provider := new.raw_app_meta_data->>'provider';
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '');
  v_version := new.raw_user_meta_data->>'terms_accepted_version';
  begin v_accepted := (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz;
  exception when others then v_accepted := null; end;
  if v_provider is distinct from 'google' and (v_version is distinct from '2026-10-19-v1' or v_accepted is null) then
    raise exception 'L’acceptation des conditions et de la politique de confidentialité est requise.';
  end if;
  insert into public.profiles(id, first_name, last_name, quartier, job)
  values (new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'first_name',''), nullif(split_part(v_full_name, ' ', 1), ''), ''), 80),
    left(coalesce(nullif(new.raw_user_meta_data->>'last_name',''), nullif(trim(case when position(' ' in v_full_name) > 0 then substring(v_full_name from position(' ' in v_full_name) + 1) else '' end), ''), ''), 80),
    left(coalesce(new.raw_user_meta_data->>'quartier',''), 120),
    left(coalesce(new.raw_user_meta_data->>'job',''), 120))
  on conflict (id) do nothing;
  if v_version = '2026-10-19-v1' and v_accepted is not null then
    insert into public.terms_acceptances(user_id, terms_version, accepted_at)
    values (new.id, v_version, v_accepted);
  end if;
  return new;
end $$;

-- Old simulated payments never represent a real payment; reopen them as accepted/unpaid.
update public.bookings
set status = 'accepted', amount_paid = 0, commission = 0, owner_payout = 0,
    pay_method = null, paid_at = null
where status = 'paid';
update public.bookings
set amount_paid = 0, commission = 0, owner_payout = 0, pay_method = null, paid_at = null
where status in ('requested','accepted','refused','cancelled','dispute');

drop policy if exists lp_read on public.listing_private;
create policy lp_read on public.listing_private for select using (
  exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = auth.uid() or public.is_admin()))
  or exists (select 1 from public.bookings b where b.listing_id = listing_private.listing_id
             and b.borrower_id = auth.uid() and b.status in ('accepted','ongoing'))
);

create or replace function public.listing_busy(p_listing uuid)
returns table(start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select b.start_date, b.end_date from public.bookings b
  where b.listing_id = p_listing and b.status in ('accepted','ongoing') and b.end_date >= current_date;
$$;

create or replace function public.request_booking(p_listing uuid, p_start date, p_end date) returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.listings; me public.profiles; v_days int; v_total int; v_pct int; v_discount int; v_deposit int; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connectez-vous pour réserver.'; end if;
  select * into l from public.listings where id = p_listing;
  if l.id is null or l.status <> 'online' then raise exception 'Cette annonce n''est plus disponible.'; end if;
  if l.is_demo or l.owner_id is null then raise exception 'Annonce d''exemple : elle ne peut pas être réservée.'; end if;
  if l.owner_id = auth.uid() then raise exception 'Vous ne pouvez pas réserver votre propre matériel.'; end if;
  if p_start < current_date or p_end < p_start then raise exception 'Dates invalides.'; end if;
  if p_start > current_date + interval '12 months' or p_end > current_date + interval '12 months' then
    raise exception 'Les réservations sont limitées aux douze prochains mois.';
  end if;
  if p_end - p_start > 89 then raise exception 'Une location ne peut pas dépasser 90 jours.'; end if;
  if exists (select 1 from public.bookings b where b.listing_id = p_listing
      and b.status in ('accepted','ongoing') and b.start_date <= p_end and b.end_date >= p_start) then
    raise exception 'Ces dates sont déjà réservées.';
  end if;
  select * into me from public.profiles where id = auth.uid();
  if coalesce(me.suspended, false) then raise exception 'Ce compte est temporairement suspendu.'; end if;
  if me.identity_status is distinct from 'verified' then raise exception 'Vérifiez votre identité dans votre profil avant de demander une location.'; end if;
  if not exists (select 1 from public.profiles p where p.id = l.owner_id and p.identity_status = 'verified') then
    raise exception 'Le propriétaire doit vérifier son identité avant toute réservation.';
  end if;
  v_days := (p_end - p_start) + 1;
  v_total := v_days * l.price;
  v_pct := case when me.score >= 750 then 10 when me.score >= 500 then 5 else 0 end;
  v_discount := round(v_total * v_pct / 100.0);
  v_deposit := case when me.score >= 750 then l.deposit / 2 else l.deposit end;
  insert into public.bookings(listing_id, borrower_id, owner_id, start_date, end_date, days,
    price_total, discount, amount_paid, deposit, commission, owner_payout, status)
  values (p_listing, auth.uid(), l.owner_id, p_start, p_end, v_days,
    v_total, v_discount, 0, v_deposit, 0, 0, 'requested') returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_booking(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  if public.is_suspended() then raise exception 'Ce compte est temporairement suspendu.'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.identity_status = 'verified') then
    raise exception 'Vérifiez votre identité dans votre profil avant de répondre à une demande.';
  end if;
  select * into b from public.bookings where id = p_id for update;
  if b.id is null or b.owner_id <> auth.uid() then raise exception 'Réservation introuvable.'; end if;
  if b.status <> 'requested' then raise exception 'Cette demande a déjà été traitée.'; end if;
  if p_accept then
    if exists (select 1 from public.bookings o where o.listing_id = b.listing_id and o.id <> b.id
      and o.status in ('accepted','ongoing') and o.start_date <= b.end_date and o.end_date >= b.start_date) then
      raise exception 'Ces dates viennent d''être prises par une autre réservation.';
    end if;
    update public.bookings set status = 'accepted' where id = p_id;
    insert into public.booking_codes(booking_id, code)
      values (p_id, lpad(floor(random() * 10000)::int::text, 4, '0')) on conflict (booking_id) do nothing;
  else update public.bookings set status = 'refused' where id = p_id;
  end if;
end $$;

create or replace function public.pay_booking(p_id uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
begin raise exception 'Le paiement intégré n’est pas disponible. Aucun paiement n’a été effectué par Abalma.'; end $$;
revoke execute on function public.pay_booking(uuid,text) from public, anon, authenticated;

create or replace function public.confirm_handover(p_id uuid, p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare b public.bookings; v_code text;
begin
  if public.is_suspended() then raise exception 'Ce compte est temporairement suspendu.'; end if;
  select * into b from public.bookings where id = p_id for update;
  if b.id is null or b.owner_id <> auth.uid() then raise exception 'Réservation introuvable.'; end if;
  if b.status <> 'accepted' then raise exception 'Cette réservation n’attend pas une remise acceptée.'; end if;
  if b.code_attempts >= 5 then raise exception 'Trop d’essais. Contactez Abalma.'; end if;
  select code into v_code from public.booking_codes where booking_id = p_id;
  if v_code = trim(p_code) then update public.bookings set status = 'ongoing' where id = p_id; return true; end if;
  update public.bookings set code_attempts = code_attempts + 1 where id = p_id;
  return false;
end $$;

create or replace function public.cancel_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_id for update;
  if b.id is null or b.borrower_id <> auth.uid() then raise exception 'Réservation introuvable.'; end if;
  if b.status not in ('requested','accepted') then raise exception 'Cette réservation ne peut plus être annulée ici.'; end if;
  update public.bookings set status = 'cancelled' where id = p_id;
end $$;

create or replace function public.admin_set_suspended(p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l’administrateur.'; end if;
  if p_user = auth.uid() and p_value then raise exception 'Vous ne pouvez pas suspendre votre propre compte.'; end if;
  update public.profiles set suspended = p_value where id = p_user;
end $$;

grant execute on function public.listing_busy(uuid) to anon, authenticated;
grant execute on function public.request_booking(uuid,date,date), public.respond_booking(uuid,boolean),
  public.cancel_booking(uuid), public.confirm_handover(uuid,text), public.confirm_return(uuid,boolean,text),
  public.submit_review(uuid,int,text[],text), public.admin_set_verified(uuid,boolean),
  public.admin_set_listing_status(uuid,text), public.admin_resolve_dispute(uuid,boolean),
  public.admin_set_suspended(uuid,boolean), public.is_admin() to authenticated;
grant execute on function public.admin_set_identity_status(uuid,text), public.submit_identity_documents() to authenticated;

notify pgrst, 'reload schema';

