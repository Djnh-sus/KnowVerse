-- =====================================================================
-- HỢP ĐỒNG DỮ LIỆU v1 - Web học tập (Supabase / Postgres)
-- Chạy nguyên file này 1 lần trong SQL Editor (hoặc làm migration đầu tiên).
-- =====================================================================

-- ---------- 1. Kiểu enum ----------
create type public.user_role       as enum ('user', 'admin');
create type public.content_kind    as enum ('knowledge', 'quiz');
create type public.content_state   as enum ('active', 'hidden', 'deleted');
create type public.revision_status as enum ('draft', 'pending', 'approved', 'rejected', 'superseded');
create type public.question_type   as enum ('mcq', 'tf', 'short');
create type public.report_status   as enum ('open', 'resolved', 'dismissed');
create type public.mail_status     as enum ('queued', 'sent', 'failed');

-- ---------- 2. Bảng ----------
-- Hồ sơ người dùng (1-1 với auth.users). Mật khẩu nằm ở Supabase Auth, KHÔNG nằm ở đây.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 30),
  avatar_path  text,                                  -- đường dẫn trong bucket 'avatars'; null = avatar chữ cái đầu
  role         public.user_role not null default 'user',
  created_at   timestamptz not null default now()
);
create unique index profiles_display_name_uniq on public.profiles (lower(btrim(display_name)));

-- Xác nhận mật khẩu trước khi đăng/xóa. Chỉ Edge Function (service_role) ghi bảng này.
create table public.action_confirmations (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  confirmed_until timestamptz not null default 'epoch',
  failed_count    int not null default 0,
  locked_until    timestamptz
);

-- Cây lớp > môn > bài (chỉ admin ghi)
create table public.grades (
  id      smallint primary key check (id in (10, 11, 12)),
  name    text not null,
  is_open boolean not null default false              -- lớp nào đang mở nhận nội dung
);
insert into public.grades (id, name, is_open) values
  (10, 'Lớp 10', false), (11, 'Lớp 11', false), (12, 'Lớp 12', true);

create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  grade_id   smallint not null references public.grades(id),
  name       text not null,
  slug       text not null check (slug ~ '^[a-z0-9-]+$'),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (grade_id, slug)
);

create table public.lessons (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title      text not null,
  slug       text not null check (slug ~ '^[a-z0-9-]+$'),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (subject_id, slug)
);

-- Một "đóng góp" = 1 bản kiến thức hoặc 1 bộ đề của 1 người cho 1 bài.
-- Nội dung nằm ở revisions; đây chỉ là vỏ (tác giả, trạng thái hiển thị, bản đang công khai).
create table public.contributions (
  id                    uuid primary key default gen_random_uuid(),
  lesson_id             uuid not null references public.lessons(id),
  author_id             uuid not null references public.profiles(id),
  kind                  public.content_kind not null,
  state                 public.content_state not null default 'active',
  published_revision_id uuid,                         -- bản đã duyệt đang hiện; null = chưa có bản nào công khai
  created_at            timestamptz not null default now()
);
create index contributions_lesson_idx on public.contributions (lesson_id, kind);
create index contributions_author_idx on public.contributions (author_id);

-- Các phiên bản nội dung. Sửa bài đã duyệt = tạo revision mới, bản cũ vẫn hiện tới khi bản mới được duyệt.
create table public.revisions (
  id              uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions(id) on delete cascade,
  rev_no          int not null,
  status          public.revision_status not null default 'draft',
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  body            jsonb,                              -- tài liệu TipTap/ProseMirror (kiến thức) hoặc phần giới thiệu bộ đề
  content_version smallint not null default 1,        -- phiên bản format của body/questions
  validation      jsonb not null default '[]'::jsonb check (jsonb_typeof(validation) = 'array'),
  has_errors      boolean not null default false,
  review_note     text,
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (contribution_id, rev_no)
);
-- Mỗi đóng góp chỉ có tối đa 1 revision "đang mở" (nháp / chờ duyệt / bị từ chối chưa sửa).
create unique index revisions_one_open on public.revisions (contribution_id)
  where status in ('draft', 'pending', 'rejected');
create index revisions_status_idx on public.revisions (status);

alter table public.contributions
  add constraint contributions_published_fk
  foreign key (published_revision_id) references public.revisions(id) on delete set null;

-- Từng câu hỏi (mỗi câu 1 dòng). question_key giữ nguyên qua các revision của cùng 1 câu.
create table public.questions (
  id           uuid primary key default gen_random_uuid(),
  revision_id  uuid not null references public.revisions(id) on delete cascade,
  question_key uuid not null,
  position     int not null check (position >= 1),
  qtype        public.question_type not null,
  content      jsonb not null,                        -- đề bài (doc TipTap)
  options      jsonb,                                 -- mcq: 2-6 phương án; tf: đúng 4 ý; short: null
  answer       jsonb not null,                        -- mcq {"index":n}; tf {"values":[b,b,b,b]}; short {"accepted":[...]}
  explain      jsonb,                                 -- lời giải (doc TipTap), có thể null
  no_shuffle   boolean not null default false,
  content_hash text,                                  -- client tính từ đề đã chuẩn hóa, để lọc trùng trong ngân hàng
  valid        boolean not null default false,        -- SERVER tự tính bằng trigger, không tin client
  hidden       boolean not null default false,        -- admin ẩn 1 câu sai
  created_at   timestamptz not null default now(),
  unique (revision_id, question_key),
  unique (revision_id, position)
);
create index questions_key_idx on public.questions (question_key);

create table public.contribution_ratings (
  contribution_id uuid not null references public.contributions(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  stars           smallint not null check (stars between 1 and 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (contribution_id, user_id)
);

-- Lượt xem = số cặp (người, ngày) khác nhau; ngày tính theo giờ Việt Nam.
create table public.contribution_views (
  contribution_id uuid not null references public.contributions(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  day             date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  primary key (contribution_id, user_id, day)
);

-- Lịch sử làm bài. Điểm do client tính (web học tập, không chống gian lận).
create table public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  lesson_id       uuid not null references public.lessons(id),
  source          text not null check (source in ('set', 'pool')),
  contribution_id uuid references public.contributions(id) on delete set null,
  revision_id     uuid references public.revisions(id) on delete set null,
  question_count  int not null check (question_count > 0),
  correct_count   int not null check (correct_count >= 0),
  score           numeric(5,2) not null check (score between 0 and 10),
  time_limit_sec  int,
  duration_sec    int,
  submitted_at    timestamptz not null default now(),
  check (correct_count <= question_count)
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, submitted_at desc);

create table public.attempt_answers (
  attempt_id   uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id  uuid not null references public.questions(id) on delete cascade,
  question_key uuid not null,
  position     int not null,
  response     jsonb,
  is_correct   boolean not null,
  points       numeric(4,3) not null default 0 check (points between 0 and 1),
  primary key (attempt_id, question_id)
);
create index attempt_answers_key_idx on public.attempt_answers (question_key);

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  question_id     uuid references public.questions(id) on delete cascade,
  contribution_id uuid references public.contributions(id) on delete cascade,
  reason          text not null check (char_length(btrim(reason)) between 1 and 1000),
  status          public.report_status not null default 'open',
  handled_by      uuid references public.profiles(id),
  handled_at      timestamptz,
  admin_note      text,
  created_at      timestamptz not null default now(),
  check ((question_id is not null)::int + (contribution_id is not null)::int = 1)
);
create index reports_status_idx on public.reports (status);

-- Hàng đợi mail: DB chỉ ghi sự kiện, Edge Function đọc và gửi. to_user_id null = gửi cho admin.
create table public.mail_outbox (
  id         bigint generated always as identity primary key,
  event      text not null check (event in ('review_requested', 'review_result')),
  to_user_id uuid references auth.users(id) on delete set null,
  payload    jsonb not null default '{}'::jsonb,
  status     public.mail_status not null default 'queued',
  attempts   int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index mail_outbox_queue_idx on public.mail_outbox (status, created_at);

-- Token cho link duyệt trong mail (lưu băm, dùng 1 lần, có hạn). Chỉ Edge Function đụng tới.
create table public.review_tokens (
  token_hash  text primary key,
  revision_id uuid not null references public.revisions(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- ---------- 3. Hàm phụ ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create function public.has_recent_confirmation() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.action_confirmations c
    where c.user_id = auth.uid() and c.confirmed_until > now()
  );
$$;

-- Kiểm tra cấu trúc 1 câu hỏi. Trả false (không bao giờ ném lỗi) nếu dữ liệu sai hình dạng.
create function public.is_valid_question(
  p_type public.question_type, p_content jsonb, p_options jsonb, p_answer jsonb
) returns boolean
language plpgsql immutable as $$
declare n int;
begin
  if p_content is null or jsonb_typeof(p_content) is distinct from 'object' then return false; end if;
  if (p_content->>'type') is distinct from 'doc' then return false; end if;
  if jsonb_typeof(p_content->'content') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_content->'content') = 0 then return false; end if;
  if p_answer is null or jsonb_typeof(p_answer) is distinct from 'object' then return false; end if;

  if p_type = 'mcq' then
    if jsonb_typeof(p_options) is distinct from 'array' then return false; end if;
    n := jsonb_array_length(p_options);
    if n < 2 or n > 6 then return false; end if;
    if jsonb_typeof(p_answer->'index') is distinct from 'number' then return false; end if;
    if (p_answer->>'index') !~ '^[0-9]{1,3}$' then return false; end if;
    return (p_answer->>'index')::int < n;
  elsif p_type = 'tf' then
    if jsonb_typeof(p_options) is distinct from 'array' then return false; end if;
    if jsonb_array_length(p_options) <> 4 then return false; end if;
    if jsonb_typeof(p_answer->'values') is distinct from 'array' then return false; end if;
    if jsonb_array_length(p_answer->'values') <> 4 then return false; end if;
    return not exists (
      select 1 from jsonb_array_elements(p_answer->'values') v where jsonb_typeof(v) <> 'boolean'
    );
  else -- short
    if jsonb_typeof(p_answer->'accepted') is distinct from 'array' then return false; end if;
    if jsonb_array_length(p_answer->'accepted') < 1 then return false; end if;
    return not exists (
      select 1 from jsonb_array_elements(p_answer->'accepted') v
      where jsonb_typeof(v) <> 'string' or btrim(v #>> '{}') = ''
    );
  end if;
end $$;

create function public.questions_set_valid() returns trigger
language plpgsql as $$
begin
  new.valid := public.is_valid_question(new.qtype, new.content, new.options, new.answer);
  return new;
end $$;

create trigger trg_questions_valid
  before insert or update of qtype, content, options, answer on public.questions
  for each row execute function public.questions_set_valid();

-- Nội bộ: ghi sự kiện mail. KHÔNG cấp cho authenticated.
create function public._enqueue_mail(p_event text, p_to_user uuid, p_payload jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.mail_outbox (event, to_user_id, payload) values (p_event, p_to_user, p_payload);
$$;

-- ---------- 4. Hàm nghiệp vụ (RPC) ----------
-- Mọi thay đổi trạng thái đi qua các hàm này; client KHÔNG ghi trực tiếp vào contributions/revisions/questions.
-- Lỗi trả về dạng exception với message là mã: not_authenticated, forbidden, not_found, invalid_state,
-- confirmation_required, profile_required, lesson_not_available, open_revision_exists, ...

create function public.create_contribution(p_lesson uuid, p_kind public.content_kind, p_title text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_c uuid; v_r uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'profile_required'; end if;
  if not exists (
    select 1 from public.lessons l
    join public.subjects s on s.id = l.subject_id
    join public.grades g on g.id = s.grade_id
    where l.id = p_lesson and g.is_open
  ) then raise exception 'lesson_not_available'; end if;
  insert into public.contributions (lesson_id, author_id, kind) values (p_lesson, v_uid, p_kind)
    returning id into v_c;
  insert into public.revisions (contribution_id, rev_no, title) values (v_c, 1, p_title)
    returning id into v_r;
  return jsonb_build_object('contribution_id', v_c, 'revision_id', v_r);
end $$;

-- Lưu nháp. p_questions: mảng {question_key?, qtype, content, options, answer, explain, no_shuffle, content_hash}.
-- Lỗi nội dung KHÔNG chặn lưu/gửi (chỉ gắn cờ); chỉ chặn lỗi hỏng hẳn hình dạng dữ liệu (qtype lạ, key trùng...).
create function public.save_revision(
  p_revision uuid, p_title text, p_body jsonb, p_validation jsonb, p_questions jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rev public.revisions%rowtype;
  v_kind public.content_kind;
  v_err boolean;
  v_invalid int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select r.* into v_rev
    from public.revisions r join public.contributions c on c.id = r.contribution_id
   where r.id = p_revision and c.author_id = v_uid and c.state = 'active'
   for update of r;
  if not found then raise exception 'not_found'; end if;
  if v_rev.status not in ('draft', 'rejected') then raise exception 'invalid_state'; end if;
  if p_validation is null or jsonb_typeof(p_validation) <> 'array' then raise exception 'bad_validation'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then raise exception 'bad_questions'; end if;
  if jsonb_array_length(p_questions) > 200 then raise exception 'too_many_questions'; end if;
  select c.kind into v_kind from public.contributions c where c.id = v_rev.contribution_id;
  if v_kind = 'knowledge' and jsonb_array_length(p_questions) > 0 then raise exception 'questions_not_allowed'; end if;

  delete from public.questions where revision_id = p_revision;
  insert into public.questions
    (revision_id, question_key, position, qtype, content, options, answer, explain, no_shuffle, content_hash)
  select p_revision,
         coalesce(nullif(q.value->>'question_key', '')::uuid, gen_random_uuid()),
         q.ordinality::int,
         (q.value->>'qtype')::public.question_type,
         coalesce(q.value->'content', 'null'::jsonb),
         q.value->'options',
         coalesce(q.value->'answer', 'null'::jsonb),
         q.value->'explain',
         coalesce((q.value->>'no_shuffle')::boolean, false),
         q.value->>'content_hash'
    from jsonb_array_elements(p_questions) with ordinality as q(value, ordinality);

  select count(*) into v_invalid from public.questions where revision_id = p_revision and not valid;
  v_err := v_invalid > 0 or jsonb_path_exists(p_validation, '$[*] ? (@.severity == "error")');

  update public.revisions
     set title = p_title, body = p_body, validation = p_validation, has_errors = v_err,
         status = 'draft', updated_at = now()
   where id = p_revision;
  return jsonb_build_object('has_errors', v_err, 'invalid_questions', v_invalid);
end $$;

-- Sửa bài đã duyệt: tạo revision nháp mới sao chép từ bản đang công khai (giữ question_key).
create function public.new_revision_from(p_contribution uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c public.contributions%rowtype;
  v_pub public.revisions%rowtype;
  v_new uuid; v_no int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_c from public.contributions
   where id = p_contribution and author_id = v_uid and state = 'active' for update;
  if not found then raise exception 'not_found'; end if;
  if v_c.published_revision_id is null then raise exception 'nothing_published'; end if;
  if exists (select 1 from public.revisions
              where contribution_id = v_c.id and status in ('draft', 'pending', 'rejected'))
  then raise exception 'open_revision_exists'; end if;
  select * into v_pub from public.revisions where id = v_c.published_revision_id;
  select coalesce(max(rev_no), 0) + 1 into v_no from public.revisions where contribution_id = v_c.id;
  insert into public.revisions (contribution_id, rev_no, title, body, content_version, validation, has_errors)
    values (v_c.id, v_no, v_pub.title, v_pub.body, v_pub.content_version, v_pub.validation, v_pub.has_errors)
    returning id into v_new;
  insert into public.questions
    (revision_id, question_key, position, qtype, content, options, answer, explain, no_shuffle, content_hash)
  select v_new, question_key, position, qtype, content, options, answer, explain, no_shuffle, content_hash
    from public.questions where revision_id = v_pub.id;
  return v_new;
end $$;

-- Gửi duyệt: cần đã xác nhận mật khẩu gần đây.
create function public.submit_revision(p_revision uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rev public.revisions%rowtype;
  v_c public.contributions%rowtype;
  v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select r.* into v_rev
    from public.revisions r join public.contributions c on c.id = r.contribution_id
   where r.id = p_revision and c.author_id = v_uid and c.state = 'active'
   for update of r;
  if not found then raise exception 'not_found'; end if;
  if v_rev.status <> 'draft' then raise exception 'invalid_state'; end if;
  if not public.has_recent_confirmation() then raise exception 'confirmation_required'; end if;
  update public.revisions set status = 'pending', submitted_at = now(), updated_at = now() where id = p_revision;
  select * into v_c from public.contributions where id = v_rev.contribution_id;
  select display_name into v_name from public.profiles where id = v_uid;
  perform public._enqueue_mail('review_requested', null, jsonb_build_object(
    'revision_id', p_revision, 'contribution_id', v_c.id, 'kind', v_c.kind, 'title', v_rev.title,
    'author_name', v_name, 'has_errors', v_rev.has_errors, 'is_edit', v_c.published_revision_id is not null));
end $$;

-- Rút lại bản đang chờ duyệt để sửa tiếp.
create function public.withdraw_revision(p_revision uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.revisions r set status = 'draft', updated_at = now()
    from public.contributions c
   where r.id = p_revision and c.id = r.contribution_id and c.author_id = v_uid and r.status = 'pending';
  if not found then raise exception 'not_found'; end if;
end $$;

-- Admin duyệt / từ chối. Từ chối bắt buộc có lý do.
create function public.review_revision(p_revision uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rev public.revisions%rowtype;
  v_c public.contributions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_rev from public.revisions where id = p_revision for update;
  if not found then raise exception 'not_found'; end if;
  if v_rev.status <> 'pending' then raise exception 'invalid_state'; end if;
  select * into v_c from public.contributions where id = v_rev.contribution_id for update;
  if v_c.state <> 'active' then raise exception 'contribution_inactive'; end if;

  if p_approve then
    if v_c.published_revision_id is not null then
      update public.revisions set status = 'superseded', updated_at = now() where id = v_c.published_revision_id;
    end if;
    update public.revisions
       set status = 'approved', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note, updated_at = now()
     where id = p_revision;
    update public.contributions set published_revision_id = p_revision where id = v_c.id;
  else
    if p_note is null or btrim(p_note) = '' then raise exception 'note_required'; end if;
    update public.revisions
       set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note, updated_at = now()
     where id = p_revision;
  end if;

  perform public._enqueue_mail('review_result', v_c.author_id, jsonb_build_object(
    'revision_id', p_revision, 'contribution_id', v_c.id, 'title', v_rev.title,
    'approved', p_approve, 'note', p_note));
end $$;

-- Xóa mềm. Tác giả tự xóa cần xác nhận mật khẩu; admin xóa bài người khác thì không cần.
create function public.delete_contribution(p_contribution uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_c public.contributions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_c from public.contributions where id = p_contribution for update;
  if not found then raise exception 'not_found'; end if;
  if v_c.author_id <> v_uid and not public.is_admin() then raise exception 'forbidden'; end if;
  if v_c.author_id = v_uid and not public.has_recent_confirmation() then raise exception 'confirmation_required'; end if;
  update public.contributions set state = 'deleted' where id = p_contribution;
end $$;

create function public.set_contribution_state(p_contribution uuid, p_state public.content_state)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.contributions set state = p_state where id = p_contribution;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.rate_contribution(p_contribution uuid, p_stars int) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then raise exception 'bad_stars'; end if;
  perform 1 from public.contributions c
   where c.id = p_contribution and c.state = 'active'
     and c.published_revision_id is not null and c.author_id <> v_uid;
  if not found then raise exception 'not_rateable'; end if;
  insert into public.contribution_ratings (contribution_id, user_id, stars)
    values (p_contribution, v_uid, p_stars)
  on conflict (contribution_id, user_id) do update set stars = excluded.stars, updated_at = now();
end $$;

create function public.record_view(p_contribution uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into public.contribution_views (contribution_id, user_id)
  select c.id, v_uid from public.contributions c
   where c.id = p_contribution and c.state = 'active'
     and c.published_revision_id is not null and c.author_id <> v_uid
  on conflict do nothing;
end $$;

-- Lưu 1 lượt làm bài. p_attempt: {lesson_id, source, contribution_id?, revision_id?, score, time_limit_sec?, duration_sec?}
-- p_answers: mảng {question_id, response, is_correct, points?}
create function public.save_attempt(p_attempt jsonb, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_n int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) = 0
  then raise exception 'bad_answers'; end if;
  v_n := jsonb_array_length(p_answers);
  insert into public.quiz_attempts
    (user_id, lesson_id, source, contribution_id, revision_id, question_count, correct_count, score,
     time_limit_sec, duration_sec)
  values (v_uid, (p_attempt->>'lesson_id')::uuid, p_attempt->>'source',
          nullif(p_attempt->>'contribution_id', '')::uuid, nullif(p_attempt->>'revision_id', '')::uuid,
          v_n,
          (select count(*) from jsonb_array_elements(p_answers) a where (a->>'is_correct')::boolean),
          (p_attempt->>'score')::numeric,
          nullif(p_attempt->>'time_limit_sec', '')::int, nullif(p_attempt->>'duration_sec', '')::int)
  returning id into v_id;
  insert into public.attempt_answers (attempt_id, question_id, question_key, position, response, is_correct, points)
  select v_id, q.id, q.question_key, a.ordinality::int, a.value->'response',
         (a.value->>'is_correct')::boolean,
         coalesce((a.value->>'points')::numeric, case when (a.value->>'is_correct')::boolean then 1 else 0 end)
    from jsonb_array_elements(p_answers) with ordinality as a(value, ordinality)
    join public.questions q on q.id = (a.value->>'question_id')::uuid;
  if (select count(*) from public.attempt_answers where attempt_id = v_id) <> v_n
  then raise exception 'unknown_question'; end if;
  return v_id;
end $$;

-- Danh sách thanh các bản đóng góp của 1 bài, đã xếp theo điểm.
-- Điểm = trung bình có trọng số (Bayes): (3*3.5 + tổng sao) / (3 + số lượt chấm); hòa thì xét lượt xem.
create function public.list_contribution_cards(p_lesson uuid, p_kind public.content_kind)
returns table (
  contribution_id uuid, revision_id uuid, title text, author_id uuid, author_name text,
  author_avatar_path text, rating_avg numeric, rating_count bigint, view_count bigint,
  score numeric, published_at timestamptz, my_stars smallint
)
language sql stable security definer set search_path = public as $$
  select c.id, r.id, r.title, c.author_id, p.display_name, p.avatar_path,
         round(rt.avg_stars, 2), rt.n, vw.n,
         round((3 * 3.5 + coalesce(rt.sum_stars, 0)) / (3 + rt.n), 3),
         r.reviewed_at, my.stars
    from public.contributions c
    join public.revisions r on r.id = c.published_revision_id
    join public.profiles p on p.id = c.author_id
    left join lateral (
      select count(*) as n, sum(x.stars) as sum_stars, avg(x.stars) as avg_stars
        from public.contribution_ratings x where x.contribution_id = c.id) rt on true
    left join lateral (
      select count(*) as n from public.contribution_views v where v.contribution_id = c.id) vw on true
    left join public.contribution_ratings my on my.contribution_id = c.id and my.user_id = auth.uid()
   where c.lesson_id = p_lesson and c.kind = p_kind and c.state = 'active' and auth.uid() is not null
   order by 10 desc, 9 desc, 11 desc;
$$;

-- Ngân hàng chung của 1 bài: câu hợp lệ, không bị ẩn, thuộc bản đang công khai; lọc trùng theo content_hash.
create function public.pool_questions(p_lesson uuid) returns setof public.questions
language sql stable security invoker set search_path = public as $$
  select distinct on (coalesce(q.content_hash, q.id::text)) q.*
    from public.questions q
    join public.contributions c on c.published_revision_id = q.revision_id
   where c.lesson_id = p_lesson and c.kind = 'quiz' and c.state = 'active' and q.valid and not q.hidden
   order by coalesce(q.content_hash, q.id::text), q.created_at;
$$;

-- Ôn câu sai: các câu mà lần làm gần nhất của mình là sai (làm đúng lại thì tự rời danh sách).
create function public.my_wrong_questions(p_lesson uuid default null) returns setof public.questions
language sql stable security invoker set search_path = public as $$
  with last_ans as (
    select distinct on (aa.question_key) aa.question_key, aa.is_correct
      from public.attempt_answers aa join public.quiz_attempts a on a.id = aa.attempt_id
     where a.user_id = auth.uid() and (p_lesson is null or a.lesson_id = p_lesson)
     order by aa.question_key, a.submitted_at desc
  )
  select q.*
    from last_ans l
    join public.questions q on q.question_key = l.question_key
    join public.contributions c on c.published_revision_id = q.revision_id
   where not l.is_correct and c.state = 'active' and q.valid and not q.hidden
   order by q.created_at;
$$;

-- ---------- 5. Row Level Security ----------
alter table public.profiles             enable row level security;
alter table public.action_confirmations enable row level security;
alter table public.grades               enable row level security;
alter table public.subjects             enable row level security;
alter table public.lessons              enable row level security;
alter table public.contributions        enable row level security;
alter table public.revisions            enable row level security;
alter table public.questions            enable row level security;
alter table public.contribution_ratings enable row level security;
alter table public.contribution_views   enable row level security;
alter table public.quiz_attempts        enable row level security;
alter table public.attempt_answers      enable row level security;
alter table public.reports              enable row level security;
alter table public.mail_outbox          enable row level security;
alter table public.review_tokens        enable row level security;

-- Phải đăng nhập mới xem được gì (không có policy nào cho anon).
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy grades_select   on public.grades   for select to authenticated using (true);
create policy subjects_select on public.subjects for select to authenticated using (true);
create policy lessons_select  on public.lessons  for select to authenticated using (true);
create policy grades_admin    on public.grades   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy subjects_admin  on public.subjects for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy lessons_admin   on public.lessons  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy contributions_select on public.contributions for select to authenticated using (
  public.is_admin()
  or (author_id = auth.uid() and state <> 'deleted')
  or (state = 'active' and published_revision_id is not null)
);

create policy revisions_select on public.revisions for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.contributions c
              where c.id = revisions.contribution_id and c.author_id = auth.uid() and c.state <> 'deleted')
  or exists (select 1 from public.contributions c
              where c.published_revision_id = revisions.id and c.state = 'active')
);

create policy questions_select on public.questions for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.revisions r join public.contributions c on c.id = r.contribution_id
              where r.id = questions.revision_id and c.author_id = auth.uid() and c.state <> 'deleted')
  or (valid and not hidden and exists (
        select 1 from public.contributions c
         where c.published_revision_id = questions.revision_id and c.state = 'active'))
);
create policy questions_admin_update on public.questions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy ratings_select_own on public.contribution_ratings for select to authenticated using (user_id = auth.uid());
create policy attempts_select_own on public.quiz_attempts for select to authenticated using (user_id = auth.uid());
create policy answers_select_own on public.attempt_answers for select to authenticated using (
  exists (select 1 from public.quiz_attempts a where a.id = attempt_answers.attempt_id and a.user_id = auth.uid()));

create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_admin_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- action_confirmations, mail_outbox, review_tokens, contribution_views: không có policy
-- => chỉ service_role (Edge Function) và các hàm security definer đụng được.

-- ---------- 6. Quyền (privileges) ----------
-- Supabase mặc định cấp hết quyền bảng cho anon/authenticated nên phải thu lại rồi cấp từng cái.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.profiles, public.grades, public.subjects, public.lessons,
                public.contributions, public.revisions, public.questions,
                public.contribution_ratings, public.quiz_attempts, public.attempt_answers,
                public.reports to authenticated;
-- profiles: user chỉ được ghi các cột này (không đụng role)
grant insert (id, display_name, avatar_path) on public.profiles to authenticated;
grant update (display_name, avatar_path)     on public.profiles to authenticated;
-- cây lớp/môn/bài: admin ghi (RLS chặn người khác)
grant insert, update, delete on public.grades, public.subjects, public.lessons to authenticated;
-- admin ẩn câu sai / xử lý báo sai
grant update (hidden) on public.questions to authenticated;
grant insert on public.reports to authenticated;
grant update (status, handled_by, handled_at, admin_note) on public.reports to authenticated;

grant execute on function
  public.is_admin(), public.has_recent_confirmation(),
  public.create_contribution(uuid, public.content_kind, text),
  public.save_revision(uuid, text, jsonb, jsonb, jsonb),
  public.new_revision_from(uuid), public.submit_revision(uuid), public.withdraw_revision(uuid),
  public.review_revision(uuid, boolean, text), public.delete_contribution(uuid),
  public.set_contribution_state(uuid, public.content_state),
  public.rate_contribution(uuid, int), public.record_view(uuid),
  public.save_attempt(jsonb, jsonb),
  public.list_contribution_cards(uuid, public.content_kind),
  public.pool_questions(uuid), public.my_wrong_questions(uuid)
to authenticated;
-- service_role (Edge Function) giữ nguyên toàn quyền mặc định của Supabase.

-- ---------- 7. Storage (ảnh) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('content-images', 'content-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars',        'avatars',        false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Đường dẫn file bắt buộc dạng {user_id}/{tên-file}; xem thì cần đăng nhập, ghi/xóa chỉ trong thư mục của mình.
create policy images_select on storage.objects for select to authenticated
  using (bucket_id in ('content-images', 'avatars'));
create policy images_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('content-images', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy images_delete on storage.objects for delete to authenticated
  using (bucket_id in ('content-images', 'avatars')
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Cấp admin (chạy tay 1 lần bằng quyền postgres trong SQL Editor, KHÔNG làm qua app):
--   update public.profiles set role = 'admin' where id = '<uuid-cua-admin>';

-- Vá sau khi nạp (đã áp dụng trên project qua migration knowverse_04):
alter function public.is_valid_question(public.question_type, jsonb, jsonb, jsonb) set search_path = public;
alter function public.questions_set_valid() set search_path = public;
