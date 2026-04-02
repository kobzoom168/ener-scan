-- Energy categories + copy templates (data layer for Flex/LINE/report wording).
-- Safe additive migration; does not alter scan_results_v2 / report_publications.
-- Requires: public.set_updated_at() (same contract as sql/024_report_publications.sql).

create table if not exists public.energy_categories (
  id bigserial primary key,
  code text not null unique,
  name_th text not null,
  display_name_th text not null,
  short_name_th text,
  description_th text,
  tone_default text not null default 'hard',
  priority int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.energy_categories is
  'Primary energy themes: system key (code), display labels, default tone.';

create table if not exists public.energy_copy_templates (
  id bigserial primary key,
  category_code text not null references public.energy_categories (code) on delete cascade,
  object_family text not null default 'all',
  copy_type text not null,
  tone text not null default 'hard',
  text_th text not null,
  weight int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.energy_copy_templates is
  'Headline / fit_line / bullet lines per category × object_family × tone; editable without deploy.';

comment on column public.energy_copy_templates.object_family is
  'all | thai_amulet | thai_talisman | crystal | global_symbol';

comment on column public.energy_copy_templates.copy_type is
  'headline | fit_line | bullet';

create table if not exists public.object_family_category_map (
  id bigserial primary key,
  object_family text not null,
  category_code text not null references public.energy_categories (code) on delete cascade,
  priority int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (object_family, category_code)
);

comment on table public.object_family_category_map is
  'Suggested category emphasis order per object family (e.g. crystal vs thai amulet).';

-- Indexes for lookup paths used by the app helpers
create index if not exists idx_energy_categories_active_priority
  on public.energy_categories (is_active, priority asc);

create index if not exists idx_energy_copy_templates_lookup
  on public.energy_copy_templates (category_code, object_family, tone, is_active);

create index if not exists idx_energy_copy_templates_copy_type
  on public.energy_copy_templates (category_code, copy_type, tone, is_active);

create index if not exists idx_object_family_category_map_family
  on public.object_family_category_map (object_family, is_active, priority asc);

-- updated_at (requires public.set_updated_at — same as report_publications)
drop trigger if exists trg_energy_categories_set_updated_at on public.energy_categories;
create trigger trg_energy_categories_set_updated_at
  before update on public.energy_categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_energy_copy_templates_set_updated_at on public.energy_copy_templates;
create trigger trg_energy_copy_templates_set_updated_at
  before update on public.energy_copy_templates
  for each row execute function public.set_updated_at();

-- Seed: categories
insert into public.energy_categories
  (code, name_th, display_name_th, short_name_th, description_th, tone_default, priority)
values
  ('money_work', 'เงินงาน', 'เปิดเงินงาน', 'เงินงาน', 'เด่นเรื่องเงิน งาน โอกาส และจังหวะที่ช่วยให้ชีวิตขยับ', 'hard', 10),
  ('charm', 'เสน่ห์', 'ดึงคนเข้าหา', 'เสน่ห์', 'เด่นเรื่องคน เมตตา ความรัก การคุย และการเปิดรับจากคนรอบตัว', 'hard', 20),
  ('confidence', 'มั่นใจ', 'ดันความมั่นใจ', 'มั่นใจ', 'เด่นเรื่องความมั่นใจ น้ำหนักในตัว การตัดสินใจ และการยืนให้ชัด', 'hard', 30),
  ('protection', 'คุ้มครอง', 'กันแรงลบ', 'คุ้มครอง', 'เด่นเรื่องคุ้มครอง กันพลังลบ กันแรงปะทะ และกันเรื่องไม่ดี', 'hard', 40),
  ('focus', 'คุมใจ', 'ตั้งหลักไว', 'คุมใจ', 'เด่นเรื่องคุมสติ คุมใจ ตั้งหลัก และไม่หลุดง่ายเวลาเจอแรงกด', 'hard', 50),
  ('relief', 'เบาชีวิต', 'ลดความหนัก', 'เบาชีวิต', 'เด่นเรื่องลดความอึดอัด ความหนัก และช่วยให้ฟื้นแรงได้ง่ายขึ้น', 'normal', 60)
on conflict (code) do update set
  name_th = excluded.name_th,
  display_name_th = excluded.display_name_th,
  short_name_th = excluded.short_name_th,
  description_th = excluded.description_th,
  tone_default = excluded.tone_default,
  priority = excluded.priority,
  updated_at = now();

-- Seed: copy templates — crystal
insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight)
values
  ('money_work', 'crystal', 'headline', 'hard', 'เด่นเรื่องเปิดทางเงินกับงาน', 10),
  ('money_work', 'crystal', 'fit_line', 'hard', 'เหมาะกับคนที่อยากให้เรื่องเงินและงานเริ่มขยับ', 10),
  ('money_work', 'crystal', 'bullet', 'hard', 'ช่วยให้เห็นช่องทางใหม่ได้ไวขึ้น', 10),
  ('money_work', 'crystal', 'bullet', 'hard', 'ช่วยดันจังหวะดีเรื่องงานและโอกาส', 20),
  ('charm', 'crystal', 'headline', 'hard', 'เด่นเรื่องเสน่ห์และแรงดึงดูด', 10),
  ('charm', 'crystal', 'fit_line', 'hard', 'เหมาะกับคนที่อยากให้คนเปิดรับมากขึ้น', 10),
  ('charm', 'crystal', 'bullet', 'hard', 'ช่วยให้คนเข้าหาง่ายขึ้น', 10),
  ('charm', 'crystal', 'bullet', 'hard', 'ช่วยให้คุยแล้วบรรยากาศเปิดมากขึ้น', 20),
  ('confidence', 'crystal', 'headline', 'hard', 'เด่นเรื่องความมั่นใจและน้ำหนักในตัว', 10),
  ('confidence', 'crystal', 'fit_line', 'hard', 'เหมาะกับช่วงที่ต้องพูดให้คนฟังและตัดสินใจให้คม', 10),
  ('confidence', 'crystal', 'bullet', 'hard', 'ช่วยให้พูดแล้วมีน้ำหนักขึ้น', 10),
  ('confidence', 'crystal', 'bullet', 'hard', 'ช่วยให้ยืนชัดขึ้นเวลาเจอสถานการณ์กดดัน', 20),
  ('protection', 'crystal', 'headline', 'hard', 'เด่นเรื่องกันแรงลบและพลังคน', 10),
  ('protection', 'crystal', 'fit_line', 'hard', 'เหมาะกับคนที่ต้องเจอคนเยอะและไม่อยากรับพลังมั่วเข้าตัว', 10),
  ('protection', 'crystal', 'bullet', 'hard', 'ช่วยกันแรงลบและแรงปะทะที่ไม่จำเป็น', 10),
  ('protection', 'crystal', 'bullet', 'hard', 'ช่วยให้ไม่รับอารมณ์คนอื่นเข้าตัวง่ายเกินไป', 20),
  ('focus', 'crystal', 'headline', 'hard', 'เด่นเรื่องคุมใจและดึงสติกลับมา', 10),
  ('focus', 'crystal', 'fit_line', 'hard', 'เหมาะกับช่วงที่หัววุ่นและต้องตั้งหลักให้เร็ว', 10),
  ('focus', 'crystal', 'bullet', 'hard', 'ช่วยให้ไม่หลุดง่ายเวลาเจอแรงกด', 10),
  ('focus', 'crystal', 'bullet', 'hard', 'ช่วยดึงตัวเองกลับมาอยู่กับสิ่งตรงหน้าได้ไวขึ้น', 20),
  ('relief', 'crystal', 'headline', 'normal', 'เด่นเรื่องลดความหนักและคืนแรงให้ตัวเอง', 10),
  ('relief', 'crystal', 'fit_line', 'normal', 'เหมาะกับช่วงที่เหนื่อยสะสมและอยากเบาตัวลงหน่อย', 10),
  ('relief', 'crystal', 'bullet', 'normal', 'ช่วยให้หัวไม่ตึงตลอดเวลา', 10),
  ('relief', 'crystal', 'bullet', 'normal', 'ช่วยให้ฟื้นแรงได้ง่ายขึ้นในวันที่หมด', 20);

-- Seed: copy templates — thai_amulet
insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight)
values
  ('protection', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องคุ้มครอง กันแรงปะทะได้ชัด', 10),
  ('protection', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับคนที่อยากมีของติดตัวไว้กันเรื่องไม่ดี', 10),
  ('protection', 'thai_amulet', 'bullet', 'hard', 'ช่วยกันแรงลบและแรงปะทะรอบตัว', 10),
  ('protection', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้ฟีลเหมือนมีเกราะคอยกันอยู่', 20),
  ('confidence', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องบารมีและน้ำหนักในตัว', 10),
  ('confidence', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับช่วงที่ต้องยืนให้ชัดและพูดให้คนฟัง', 10),
  ('confidence', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้พูดแล้วมีน้ำหนักขึ้น', 10),
  ('confidence', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้คนมองข้ามได้ยากขึ้น', 20),
  ('money_work', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องโชคลาภและทางเงิน', 10),
  ('money_work', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับคนที่อยากให้เรื่องเงินกับงานเริ่มเดิน', 10),
  ('money_work', 'thai_amulet', 'bullet', 'hard', 'ช่วยเปิดทางเรื่องเงินและโอกาส', 10),
  ('money_work', 'thai_amulet', 'bullet', 'hard', 'ช่วยดันจังหวะดีให้เข้ามาไวขึ้น', 20),
  ('charm', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องเมตตาและคนเปิดรับ', 10),
  ('charm', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับคนที่อยากให้คุยง่าย เจรจาง่าย คนเอ็นดู', 10),
  ('charm', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้คนเปิดรับและเข้าหาง่ายขึ้น', 10),
  ('charm', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้เจรจาแล้วไม่ติดขัดง่าย', 20);

-- Seed: object_family → category priority
insert into public.object_family_category_map (object_family, category_code, priority)
values
  ('thai_amulet', 'protection', 10),
  ('thai_amulet', 'confidence', 20),
  ('thai_amulet', 'money_work', 30),
  ('thai_amulet', 'charm', 40),
  ('thai_talisman', 'protection', 10),
  ('thai_talisman', 'confidence', 20),
  ('thai_talisman', 'money_work', 30),
  ('thai_talisman', 'charm', 40),
  ('crystal', 'money_work', 10),
  ('crystal', 'confidence', 20),
  ('crystal', 'protection', 30),
  ('crystal', 'charm', 40),
  ('crystal', 'focus', 50),
  ('crystal', 'relief', 60)
on conflict (object_family, category_code) do update set
  priority = excluded.priority,
  is_active = true;
