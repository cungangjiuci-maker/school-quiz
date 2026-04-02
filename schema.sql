-- 教員テーブル（Supabase Auth と連携）
create table if not exists teachers (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  name text,
  created_at timestamptz default now()
);

-- 小テストテーブル
create table if not exists quizzes (
  id uuid default gen_random_uuid() primary key,
  teacher_id uuid references teachers(id) on delete cascade not null,
  title text not null,
  subject text,
  code char(4) not null unique,
  estimated_minutes int default 10,
  total_points int default 10,
  questions jsonb not null default '[]',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 生徒テーブル
create table if not exists students (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  student_number text,
  created_at timestamptz default now()
);

-- 回答・採点テーブル
create table if not exists answers (
  id uuid default gen_random_uuid() primary key,
  quiz_id uuid references quizzes(id) on delete cascade not null,
  student_id uuid references students(id) on delete cascade not null,
  student_name text not null,
  student_number text,
  answers jsonb not null default '{}',
  score int default 0,
  total_points int default 0,
  grading_details jsonb default '[]',
  submitted_at timestamptz default now()
);

-- インデックス
create index if not exists idx_quizzes_code on quizzes(code);
create index if not exists idx_quizzes_teacher_id on quizzes(teacher_id);
create index if not exists idx_answers_quiz_id on answers(quiz_id);
create index if not exists idx_answers_student_id on answers(student_id);

-- Row Level Security
alter table teachers enable row level security;
alter table quizzes enable row level security;
alter table students enable row level security;
alter table answers enable row level security;

-- teachers ポリシー
create policy "Teachers can view own profile" on teachers
  for select using (auth.uid() = id);

create policy "Teachers can update own profile" on teachers
  for update using (auth.uid() = id);

create policy "Teachers can insert own profile" on teachers
  for insert with check (auth.uid() = id);

-- quizzes ポリシー
create policy "Teachers can manage own quizzes" on quizzes
  for all using (auth.uid() = teacher_id);

create policy "Anyone can read active quizzes by code" on quizzes
  for select using (is_active = true);

-- students ポリシー
create policy "Anyone can insert students" on students
  for insert with check (true);

create policy "Teachers can view students" on students
  for select using (auth.uid() is not null);

-- answers ポリシー
create policy "Anyone can insert answers" on answers
  for insert with check (true);

create policy "Teachers can view answers" on answers
  for select using (auth.uid() is not null);

-- 教員サインアップ時に teachers レコードを自動作成
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.teachers (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
