-- Only the public Edge Function may submit, using its server-side service-role key.
create schema if not exists reports_private;
revoke all on schema reports_private from public, anon, authenticated;

create table public.dictionary_reports (
  id bigint generated always as identity primary key,
  term text not null check (char_length(term) between 1 and 120),
  category text not null check (category in ('missing', 'incorrect')),
  target_language text not null default 'my' check (target_language = 'my'),
  dictionary_version text not null,
  phrase_dictionary_version text not null,
  last_app_version text not null,
  report_count bigint not null default 1,
  status text not null default 'new' check (status in ('new', 'reviewed', 'added', 'rejected')),
  first_reported_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now(),
  unique (term, category, dictionary_version, phrase_dictionary_version)
);
alter table public.dictionary_reports enable row level security;
revoke all on public.dictionary_reports from public, anon, authenticated;
grant select, update on public.dictionary_reports to service_role;

create table reports_private.receipts (
  request_id uuid primary key,
  fingerprint text not null,
  created_at timestamptz not null default now()
);
create table reports_private.submission_limit (
  singleton boolean primary key default true check (singleton),
  window_start timestamptz not null,
  submissions integer not null default 0
);
insert into reports_private.submission_limit (window_start) values (date_trunc('hour', now()));

create function public.submit_dictionary_report(
  p_request_id uuid, p_term text, p_category text, p_target_language text,
  p_app_version text, p_dictionary_version text, p_phrase_dictionary_version text
) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  current_window timestamptz := date_trunc('hour', now());
  limit_row reports_private.submission_limit%rowtype;
  old_fingerprint text;
  fingerprint text;
begin
  if p_request_id is null or p_request_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_term is null or char_length(p_term) not between 1 and 120
    or p_term <> lower(btrim(p_term)) or p_term ~ '[[:cntrl:]]'
    or p_term ~ '[/:<>\\]' or cardinality(string_to_array(p_term, ' ')) > 5
    or p_category is null or p_category not in ('missing', 'incorrect')
    or p_target_language is distinct from 'my'
    or p_app_version is null or char_length(p_app_version) > 32 or p_app_version !~ '^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.-]+)?$'
    or p_dictionary_version is null or char_length(p_dictionary_version) > 32 or p_dictionary_version !~ '^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.-]+)?$'
    or p_phrase_dictionary_version is null or char_length(p_phrase_dictionary_version) > 32 or p_phrase_dictionary_version !~ '^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.-]+)?$'
  then return 'invalid'; end if;

  fingerprint := md5(jsonb_build_array(p_term, p_category, p_target_language,
    p_app_version, p_dictionary_version, p_phrase_dictionary_version)::text);

  -- Serialize quota, retry receipts, and count updates in one short transaction.
  select * into strict limit_row from reports_private.submission_limit where singleton for update;
  select r.fingerprint into old_fingerprint from reports_private.receipts r where request_id = p_request_id;
  if found then
    if old_fingerprint = fingerprint then return 'accepted'; end if;
    return 'invalid';
  end if;
  if limit_row.window_start <> current_window then
    update reports_private.submission_limit set window_start = current_window, submissions = 0 where singleton;
    limit_row.submissions := 0;
    delete from reports_private.receipts where created_at < now() - interval '7 days';
  end if;
  -- Anonymous endpoint: global storage quota, not proof that a caller is the official app.
  if limit_row.submissions >= 500 then return 'limited'; end if;
  update reports_private.submission_limit set submissions = submissions + 1 where singleton;

  insert into public.dictionary_reports (
    term, category, target_language, dictionary_version, phrase_dictionary_version, last_app_version
  ) values (p_term, p_category, p_target_language, p_dictionary_version, p_phrase_dictionary_version, p_app_version)
  on conflict (term, category, dictionary_version, phrase_dictionary_version) do update
    set report_count = dictionary_reports.report_count + 1,
        last_reported_at = now(), last_app_version = excluded.last_app_version;
  insert into reports_private.receipts (request_id, fingerprint) values (p_request_id, fingerprint);
  return 'accepted';
end
$$;
revoke all on function public.submit_dictionary_report(uuid,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_dictionary_report(uuid,text,text,text,text,text,text) to service_role;
