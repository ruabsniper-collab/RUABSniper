-- Rutgers Course Sniper — initial schema
-- Design notes:
--   * No user accounts. The app generates a random UUID on first launch
--     (see mobile/src/lib/deviceId.ts) and that's the only identifier tied
--     to a watch. There's nothing NetID-shaped to protect.
--   * `courses`/`sections` are a cache of the public Rutgers SOC API,
--     refreshed by backend/scripts/ingest-courses.ts.
--   * `professor_rmp_matches` is a cache of fuzzy-matched RateMyProfessors
--     data, refreshed by backend/scripts/match-professors.ts.
--   * `watches` is what the GitHub Actions poller diffs against to decide
--     when to send a notification email (see backend/lib/resendEmail.ts —
--     no Apple Developer Program membership, so no real APNs push; the
--     poller emails a single fixed address instead, set via the
--     NOTIFY_EMAIL_TO GitHub Actions secret).
--
-- RLS is enabled but policies are permissive (any anon-key holder can
-- read/write). That's acceptable for a personal-scale tool with no
-- sensitive data in these tables — it is NOT a multi-tenant security
-- model. Don't put anything sensitive in here.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  term_year int not null,
  term_code int not null,            -- 1=Spring, 7=Summer, 9=Fall, 0=Winter
  campus text not null default 'NB',
  subject_code text not null,        -- e.g. "160"
  subject_description text,          -- e.g. "Chemistry & Chemical Biology"
  course_number text not null,       -- e.g. "161"
  title text not null,
  credits numeric,
  core_codes text[] not null default '{}',
  raw jsonb not null,                -- full SOC course object, for fields we haven't modeled
  updated_at timestamptz not null default now(),
  unique (term_year, term_code, campus, subject_code, course_number)
);

create index if not exists courses_search_idx
  on courses using gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(subject_description, ''))
  );
create index if not exists courses_core_codes_idx on courses using gin (core_codes);
create index if not exists courses_subject_idx on courses (term_year, term_code, subject_code);

-- ---------------------------------------------------------------------
-- sections
-- ---------------------------------------------------------------------
create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  term_year int not null,
  term_code int not null,
  index_number text not null,        -- 5-digit WebReg index, unique per term
  section_number text not null,
  instructors text[] not null default '{}',  -- as SOC spells them: "Last, First"
  open boolean not null default false,
  meeting_times jsonb not null default '[]', -- [{day, start, end, campus, building, room}]
  comments text,
  updated_at timestamptz not null default now(),
  unique (term_year, term_code, index_number)
);

create index if not exists sections_course_idx on sections (course_id);
create index if not exists sections_open_idx on sections (term_year, term_code, open);

-- ---------------------------------------------------------------------
-- professor_rmp_matches
-- ---------------------------------------------------------------------
create table if not exists professor_rmp_matches (
  id uuid primary key default gen_random_uuid(),
  instructor_name text not null unique,  -- normalized (lowercase, trimmed) SOC instructor name
  rmp_legacy_id text,                    -- numeric id used in ratemyprofessors.com/professor/{id}
  rmp_first_name text,
  rmp_last_name text,
  rmp_department text,
  avg_rating numeric,
  num_ratings int,
  would_take_again_percent numeric,
  difficulty numeric,
  profile_url text,
  confidence numeric not null default 0, -- 0..1, shown in the UI, never hidden
  match_method text,                     -- 'exact' | 'fuzzy' | 'none'
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- watches
-- ---------------------------------------------------------------------
create table if not exists watches (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  term_year int not null,
  term_code int not null,
  index_number text not null,
  last_status boolean not null default false,  -- last known open/closed
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (device_id, term_year, term_code, index_number)
);

create index if not exists watches_lookup_idx on watches (term_year, term_code, index_number);
create index if not exists watches_device_idx on watches (device_id);

-- ---------------------------------------------------------------------
-- RLS (permissive — see design notes above)
-- ---------------------------------------------------------------------
alter table courses enable row level security;
alter table sections enable row level security;
alter table professor_rmp_matches enable row level security;
alter table watches enable row level security;

create policy "public read courses" on courses for select using (true);
create policy "public read sections" on sections for select using (true);
create policy "public read professor_rmp_matches" on professor_rmp_matches for select using (true);

create policy "anon manage own watches" on watches for all using (true) with check (true);

-- courses/sections/professor_rmp_matches are written only by the backend
-- scripts using the service_role key, which bypasses RLS — no anon write
-- policy needed for those.
