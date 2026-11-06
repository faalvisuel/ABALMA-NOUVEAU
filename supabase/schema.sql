-- =====================================================================
-- Abalma — schéma de base de données (Supabase / PostgreSQL)
-- À coller une seule fois dans Supabase > SQL Editor > New query > Run.
-- Version de test : le paiement est SIMULÉ (aucun argent réel).
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  quartier text not null default '',
  job text not null default '',
  verified boolean not null default false,
  is_admin boolean not null default false,
  score int not null default 400,            -- score de confiance de l'emprunteur (0 à 1000)
  rentals_done int not null default 0,       -- locations terminées comme emprunteur
  disputes int not null default 0,
  owner_rentals int not null default 0,      -- locations terminées comme loueur
  owner_rating numeric(3,2),
  owner_reviews int not null default 0,
  borrower_rating numeric(3,2),
  borrower_reviews int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  demo_owner text,                           -- nom affiché pour les annonces d'exemple
  is_demo boolean not null default false,
  title text not null,
  category text not null,
  category_other text,
  description text not null default '',
  quartier text not null default '',
  price int not null check (price > 0),      -- F CFA par jour
  deposit int not null default 0 check (deposit >= 0),
  photos text[] not null default '{}',
  status text not null default 'online' check (status in ('online','paused','hidden')),
  created_at timestamptz not null default now()
);

-- Adresse exacte et numéro : visibles seulement par le loueur, et par l'emprunteur après paiement
create table if not exists public.listing_private (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  exact_address text not null default '',
  whatsapp text not null default ''
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  borrower_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days int not null,
  price_total int not null,      -- prix plein
  discount int not null default 0,
  amount_paid int not null,      -- payé par l'emprunteur
  deposit int not null default 0,
  commission int not null,       -- part d'Abalma
  owner_payout int not null,     -- reçu par le loueur (85 % du prix plein)
  status text not null default 'requested'
    check (status in ('requested','accepted','refused','paid','ongoing','done','cancelled','dispute')),
  pay_method text,
  code_attempts int not null default 0,
  returned_late boolean,
  problem text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Code de remise : lisible uniquement par l'emprunteur
create table if not exists public.booking_codes (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  code text not null
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('borrower_to_owner','owner_to_borrower')),
  stars int not null check (stars between 1 and 5),
  tags text[] not null default '{}',
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (booking_id, author_id)
);

create table if not exists public.score_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points int not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ---------- Fonctions utilitaires ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.add_points(p_user uuid, p_points int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set score = greatest(0, least(1000, score + p_points)) where id = p_user;
  insert into score_events(user_id, points, reason) values (p_user, p_points, p_reason);
end $$;
revoke all on function public.add_points(uuid,int,text) from public, anon, authenticated;

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, first_name, last_name, quartier, job)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'first_name',''),
          coalesce(new.raw_user_meta_data->>'last_name',''),
          coalesce(new.raw_user_meta_data->>'quartier',''),
          coalesce(new.raw_user_meta_data->>'job',''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Sécurité (RLS) ----------
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_private enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_codes enable row level security;
alter table public.reviews enable row level security;
alter table public.score_events enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- Un utilisateur ne peut modifier que ses informations de base (pas son score, ni "vérifié", ni "admin")
revoke update on public.profiles from authenticated, anon;
grant update (first_name, last_name, quartier, job) on public.profiles to authenticated;

drop policy if exists listings_read on public.listings;
create policy listings_read on public.listings for select
  using (status = 'online' or owner_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.bookings b where b.listing_id = listings.id and b.borrower_id = auth.uid()));
drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert
  with check (owner_id = auth.uid() and is_demo = false and status in ('online','paused'));
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update
  using (owner_id = auth.uid() and status <> 'hidden') with check (owner_id = auth.uid() and is_demo = false and status in ('online','paused'));
drop policy if exists listings_delete on public.listings;
create policy listings_delete on public.listings for delete using (owner_id = auth.uid() or public.is_admin());

drop policy if exists lp_read on public.listing_private;
create policy lp_read on public.listing_private for select using (
  exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
  or exists (select 1 from public.bookings b where b.listing_id = listing_private.listing_id
             and b.borrower_id = auth.uid() and b.status in ('paid','ongoing'))
);
drop policy if exists lp_write on public.listing_private;
create policy lp_write on public.listing_private for all
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()));

drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings for select
  using (borrower_id = auth.uid() or owner_id = auth.uid() or public.is_admin());
-- Aucune écriture directe sur bookings : tout passe par les fonctions ci-dessous.

drop policy if exists codes_read on public.booking_codes;
create policy codes_read on public.booking_codes for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.borrower_id = auth.uid()));

drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (true);

drop policy if exists score_read on public.score_events;
create policy score_read on public.score_events for select using (user_id = auth.uid() or public.is_admin());

-- ---------- Logique métier ----------
-- Jours déjà pris pour une annonce (sans révéler qui a réservé)
create or replace function public.listing_busy(p_listing uuid)
returns table(start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select b.start_date, b.end_date from bookings b
  where b.listing_id = p_listing and b.status in ('accepted','paid','ongoing') and b.end_date >= current_date;
$$;

create or replace function public.request_booking(p_listing uuid, p_start date, p_end date) returns uuid
language plpgsql security definer set search_path = public as $$
declare l listings; me profiles; v_days int; v_total int; v_pct int; v_discount int; v_deposit int; v_payout int; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connectez-vous pour réserver.'; end if;
  select * into l from listings where id = p_listing;
  if l.id is null or l.status <> 'online' then raise exception 'Cette annonce n''est plus disponible.'; end if;
  if l.is_demo or l.owner_id is null then raise exception 'Annonce d''exemple : elle ne peut pas être réservée.'; end if;
  if l.owner_id = auth.uid() then raise exception 'Vous ne pouvez pas réserver votre propre matériel.'; end if;
  if p_start < current_date or p_end < p_start then raise exception 'Dates invalides.'; end if;
  if p_end - p_start > 89 then raise exception 'Une location ne peut pas dépasser 90 jours.'; end if;
  if exists (select 1 from bookings b where b.listing_id = p_listing and b.status in ('accepted','paid','ongoing')
             and b.start_date <= p_end and b.end_date >= p_start) then
    raise exception 'Ces dates sont déjà réservées.';
  end if;
  select * into me from profiles where id = auth.uid();
  v_days := (p_end - p_start) + 1;
  v_total := v_days * l.price;
  v_pct := case when me.score >= 750 then 10 when me.score >= 500 then 5 else 0 end;
  v_discount := round(v_total * v_pct / 100.0);
  v_deposit := case when me.score >= 750 then l.deposit / 2 else l.deposit end;
  v_payout := round(v_total * 0.85);
  insert into bookings(listing_id, borrower_id, owner_id, start_date, end_date, days, price_total, discount,
                       amount_paid, deposit, commission, owner_payout, status)
  values (p_listing, auth.uid(), l.owner_id, p_start, p_end, v_days, v_total, v_discount,
          v_total - v_discount, v_deposit, v_total - v_discount - v_payout, v_payout,
          case when me.score >= 900 then 'accepted' else 'requested' end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_booking(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_id for update;
  if b.id is null or b.owner_id <> auth.uid() then raise exception 'Réservation introuvable.'; end if;
  if b.status <> 'requested' then raise exception 'Cette demande a déjà été traitée.'; end if;
  if p_accept then
    if exists (select 1 from bookings o where o.listing_id = b.listing_id and o.id <> b.id
               and o.status in ('accepted','paid','ongoing')
               and o.start_date <= b.end_date and o.end_date >= b.start_date) then
      raise exception 'Ces dates viennent d''être prises par une autre réservation.';
    end if;
    update bookings set status = 'accepted' where id = p_id;
  else
    update bookings set status = 'refused' where id = p_id;
  end if;
end $$;

create or replace function public.cancel_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_id for update;
  if b.id is null or b.borrower_id <> auth.uid() then raise exception 'Réservation introuvable.'; end if;
  if b.status not in ('requested','accepted') then raise exception 'Cette réservation ne peut plus être annulée ici.'; end if;
  update bookings set status = 'cancelled' where id = p_id;
end $$;

-- Paiement SIMULÉ : à remplacer par Wave / Orange Money
create or replace function public.pay_booking(p_id uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_id for update;
  if b.id is null or b.borrower_id <> auth.uid() then raise exception 'Réservation introuvable.'; end if;
  if b.status <> 'accepted' then raise exception 'Cette réservation n''attend pas de paiement.'; end if;
  if p_method not in ('wave','orange_money') then raise exception 'Moyen de paiement inconnu.'; end if;
  update bookings set status = 'paid', pay_method = p_method, paid_at = now() where id = p_id;
  insert into booking_codes(booking_id, code) values (p_id, lpad(floor(random() * 10000)::int::text, 4, '0'))
  on conflict (booking_id) do nothing;
end $$;

-- Le loueur saisit le code donné par l'emprunteur (5 essais maximum)
create or replace function public.confirm_handover(p_id uuid, p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare b bookings; v_code text;
begin
  select * into b from bookings where id = p_id for update;
  if b.id is null or b.owner_id <> auth.uid() then raise exception 'Réservation introuvable.'; end if;
  if b.status <> 'paid' then raise exception 'Cette réservation n''attend pas de remise.'; end if;
  if b.code_attempts >= 5 then raise exception 'Trop d''essais. Contactez Abalma pour débloquer la remise.'; end if;
  select code into v_code from booking_codes where booking_id = p_id;
  if v_code = trim(p_code) then
    update bookings set status = 'ongoing' where id = p_id;
    return true;
  end if;
  update bookings set code_attempts = code_attempts + 1 where id = p_id;
  return false;
end $$;

create or replace function public.confirm_return(p_id uuid, p_late boolean, p_problem text) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_id for update;
  if b.id is null or b.owner_id <> auth.uid() then raise exception 'Réservation introuvable.'; end if;
  if b.status <> 'ongoing' then raise exception 'Cette location n''est pas en cours.'; end if;
  if coalesce(trim(p_problem), '') <> '' then
    update bookings set status = 'dispute', problem = trim(p_problem), returned_late = p_late where id = p_id;
    return;
  end if;
  update bookings set status = 'done', returned_late = p_late where id = p_id;
  update profiles set rentals_done = rentals_done + 1 where id = b.borrower_id;
  update profiles set owner_rentals = owner_rentals + 1 where id = b.owner_id;
  perform add_points(b.borrower_id, 40, 'Location terminée');
  if p_late then perform add_points(b.borrower_id, -50, 'Retour en retard');
  else perform add_points(b.borrower_id, 10, 'Retour à l''heure'); end if;
end $$;

create or replace function public.submit_review(p_id uuid, p_stars int, p_tags text[], p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; v_role text; v_target uuid;
begin
  select * into b from bookings where id = p_id;
  if b.id is null or b.status <> 'done' then raise exception 'L''avis est possible une fois la location terminée.'; end if;
  if p_stars < 1 or p_stars > 5 then raise exception 'Note invalide.'; end if;
  if auth.uid() = b.borrower_id then v_role := 'borrower_to_owner'; v_target := b.owner_id;
  elsif auth.uid() = b.owner_id then v_role := 'owner_to_borrower'; v_target := b.borrower_id;
  else raise exception 'Réservation introuvable.'; end if;
  insert into reviews(booking_id, listing_id, author_id, target_id, role, stars, tags, comment)
  values (p_id, b.listing_id, auth.uid(), v_target, v_role, p_stars, coalesce(p_tags,'{}'), left(coalesce(p_comment,''), 600));
  if v_role = 'borrower_to_owner' then
    update profiles set owner_reviews = owner_reviews + 1,
      owner_rating = round(((coalesce(owner_rating,0) * owner_reviews) + p_stars)::numeric / (owner_reviews + 1), 2)
    where id = v_target;
  else
    update profiles set borrower_reviews = borrower_reviews + 1,
      borrower_rating = round(((coalesce(borrower_rating,0) * borrower_reviews) + p_stars)::numeric / (borrower_reviews + 1), 2)
    where id = v_target;
    if p_stars = 5 then perform add_points(v_target, 10, 'Note de 5 étoiles reçue'); end if;
  end if;
exception when unique_violation then raise exception 'Vous avez déjà donné votre avis.';
end $$;

-- ---------- Administration ----------
create or replace function public.admin_set_verified(p_user uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  update profiles set verified = p_value where id = p_user;
end $$;

create or replace function public.admin_set_listing_status(p_listing uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  if p_status not in ('online','paused','hidden') then raise exception 'Statut inconnu.'; end if;
  update listings set status = p_status where id = p_listing;
end $$;

-- Clôture d'un litige : p_borrower_fault = true si l'emprunteur est en tort
create or replace function public.admin_resolve_dispute(p_id uuid, p_borrower_fault boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if not is_admin() then raise exception 'Réservé à l''administrateur.'; end if;
  select * into b from bookings where id = p_id for update;
  if b.id is null or b.status <> 'dispute' then raise exception 'Aucun litige ouvert sur cette réservation.'; end if;
  update bookings set status = 'done' where id = p_id;
  update profiles set owner_rentals = owner_rentals + 1 where id = b.owner_id;
  if p_borrower_fault then
    update profiles set disputes = disputes + 1 where id = b.borrower_id;
    perform add_points(b.borrower_id, -150, 'Litige ou casse à vos torts');
  else
    update profiles set rentals_done = rentals_done + 1 where id = b.borrower_id;
    perform add_points(b.borrower_id, 40, 'Location terminée');
  end if;
end $$;

grant execute on function public.listing_busy(uuid) to anon, authenticated;
grant execute on function public.request_booking(uuid,date,date), public.respond_booking(uuid,boolean),
  public.cancel_booking(uuid), public.pay_booking(uuid,text), public.confirm_handover(uuid,text),
  public.confirm_return(uuid,boolean,text), public.submit_review(uuid,int,text[],text),
  public.admin_set_verified(uuid,boolean), public.admin_set_listing_status(uuid,text),
  public.admin_resolve_dispute(uuid,boolean), public.is_admin() to authenticated;

-- ---------- Stockage des photos ----------
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do update set public = true;
drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select using (bucket_id = 'photos');
drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Annonces d'exemple (non réservables, supprimables depuis l'admin) ----------
insert into public.listings (is_demo, demo_owner, title, category, description, quartier, price, deposit)
select true, v.owner, v.title, v.category, v.description, v.quartier, v.price, v.deposit
from (values
  ('Moussa D.',   'Kit Sony A7 III + objectif 24-70 mm', 'Audiovisuel', 'Boîtier, objectif 24-70 mm f/2.8, 3 batteries, chargeur, 2 cartes SD 64 Go, sac de transport.', 'Sacré-Cœur', 20000, 100000),
  ('Khady S.',    'Enceinte active 1000 W + micro sans fil', 'Audiovisuel', 'Enceinte sur pied, micro sans fil et récepteur, câbles et rallonge de 10 m.', 'Parcelles Assainies', 15000, 60000),
  ('Ibrahima N.', 'Stabilisateur DJI RS 3', 'Audiovisuel', 'Stabilisateur 3 axes, mini trépied, plateau rapide, mallette de transport.', 'Mermoz', 10000, 50000),
  ('Mamadou B.',  'Groupe électrogène 3 kVA', 'Maison et énergie', 'Groupe essence sur roues, rallonge de 20 m et multiprise. Réservoir plein à la remise, à rendre plein.', 'Grand Yoff', 12000, 80000),
  ('Abdou K.',    'Perceuse à percussion + coffret de forets', 'Bricolage et outils', 'Perceuse filaire, forets béton, bois et métal, mallette de rangement.', 'Ouakam', 3000, 15000),
  ('Aïssatou D.', 'Nettoyeur haute pression', 'Bricolage et outils', 'Nettoyeur électrique avec lance, tuyau de 8 m, buse rotative pour les sols.', 'Almadies', 5000, 25000),
  ('Ousmane F.',  'Vidéoprojecteur Full HD + écran', 'Événement et fête', 'Vidéoprojecteur Full HD, écran sur trépied de 2 m, câble HDMI et télécommande.', 'Point E', 8000, 40000),
  ('Ndèye M.',    '50 chaises + bâche 6 × 4 m', 'Événement et fête', '50 chaises en plastique et une bâche 6 × 4 m avec armature.', 'Pikine', 25000, 30000)
) as v(owner, title, category, description, quartier, price, deposit)
where not exists (select 1 from public.listings where is_demo);


-- Pré-lancement Alma : mêmes ajustements que prelaunch-migration.sql pour une nouvelle base.
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
  with check (owner_id = auth.uid() and not public.is_suspended() and is_demo = false and status in ('online','paused') and cardinality(photos) between 3 and 5
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.identity_status = 'verified'));
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated
  using (owner_id = auth.uid() and not public.is_suspended() and status <> 'hidden')
  with check (owner_id = auth.uid() and not public.is_suspended() and is_demo = false and status in ('online','paused') and cardinality(photos) between 3 and 5
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.identity_status = 'verified'));
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



-- Admin: e-mail et dernière connexion de chaque compte (lecture réservée à l'administrateur)
create or replace function public.admin_users_overview()
returns table(user_id uuid, email text, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l’administrateur.'; end if;
  return query select u.id, u.email::text, u.last_sign_in_at from auth.users u;
end $$;
revoke all on function public.admin_users_overview() from public, anon;
grant execute on function public.admin_users_overview() to authenticated;

-- Vérification automatique d'identité (voir supabase/functions/verify-identity)
alter table public.profiles add column if not exists identity_review_note text;
alter table public.profiles add column if not exists identity_reviewed_by text;
alter table public.profiles add column if not exists identity_auto_checked_at timestamptz;
