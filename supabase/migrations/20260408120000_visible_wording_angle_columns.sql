-- Angle-aware + slot-aware visible wording on energy_copy_templates (DB-first Flex/report surfaces).
-- Adds nullable columns (backward compatible); legacy rows stay presentation_angle IS NULL.

alter table public.energy_copy_templates
  add column if not exists presentation_angle text null,
  add column if not exists cluster_tag text null,
  add column if not exists fallback_level int not null default 0,
  add column if not exists visible_tone text null;

comment on column public.energy_copy_templates.presentation_angle is
  'Flex/report angle id (e.g. shield, filter). Null = family-wide row for this slot.';

comment on column public.energy_copy_templates.cluster_tag is
  'Semantic cluster for anti-repeat (e.g. sem:protection, sem:ground).';

comment on column public.energy_copy_templates.fallback_level is
  'Lower = higher priority within the same angle/family match; use for staged DB fallbacks.';

comment on column public.energy_copy_templates.visible_tone is
  'plain_th | warm | concise | default; null matches any.';

create index if not exists idx_energy_copy_templates_presentation_angle
  on public.energy_copy_templates (category_code, object_family, tone, is_active, presentation_angle);

-- Deprioritize legacy crystal protection rows once angle-specific rows exist (all still valid fallbacks).
update public.energy_copy_templates
set fallback_level = 10
where category_code = 'protection'
  and object_family = 'crystal'
  and coalesce(trim(presentation_angle), '') = ''
  and copy_type in ('headline', 'fit_line', 'bullet');

-- Idempotent re-seed for angle bundle (safe to re-run in dev).
delete from public.energy_copy_templates
where category_code = 'protection'
  and object_family = 'crystal'
  and presentation_angle in ('shield', 'sanctuary', 'ground', 'filter')
  and copy_type in ('headline', 'fit_line', 'bullet', 'main_label');

-- -----------------------------
-- Crystal × protection × angle — plain Thai, distinct clusters per slot where possible
-- -----------------------------
insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active,
   presentation_angle, cluster_tag, fallback_level, visible_tone)
values
  ('protection', 'crystal', 'headline', 'hard',
   'กันเรื่องกวนใจรอบตัวได้ดี', 5, true,
   'shield', 'sem:barrier', 0, 'plain_th'),
  ('protection', 'crystal', 'fit_line', 'hard',
   'เหมาะกับคนที่ต้องเจอคนเยอะแล้วไม่อยากรับพลังแย่ ๆ เข้าตัว', 5, true,
   'shield', 'sem:calm', 0, 'plain_th'),
  ('protection', 'crystal', 'bullet', 'hard',
   'ช่วยกันแรงปะทะที่ไม่จำเป็นให้เบาลง', 5, true,
   'shield', 'sem:barrier', 0, 'plain_th'),
  ('protection', 'crystal', 'bullet', 'hard',
   'ช่วยให้ตั้งสติได้เร็วขึ้นตอนโดนเร่งหรือโดนกดดัน', 6, true,
   'shield', 'sem:neutral', 0, 'plain_th'),

  ('protection', 'crystal', 'headline', 'hard',
   'ช่วยให้รู้สึกมีพื้นที่ปลอดภัยของตัวเองชัดขึ้น', 5, true,
   'sanctuary', 'sem:boundary', 0, 'plain_th'),
  ('protection', 'crystal', 'fit_line', 'hard',
   'เหมาะกับช่วงที่อยากให้โทนนิ่งและไม่รับอารมณ์คนอื่นง่าย', 5, true,
   'sanctuary', 'sem:calm', 0, 'plain_th'),
  ('protection', 'crystal', 'bullet', 'hard',
   'ช่วยให้มีเขตแดนรอบตัวรู้สึกได้จริงขึ้น', 5, true,
   'sanctuary', 'sem:boundary', 0, 'plain_th'),
  ('protection', 'crystal', 'bullet', 'hard',
   'ช่วยไม่ให้ถูกกระแสรอบข้างดึงไปบ่อย', 6, true,
   'sanctuary', 'sem:neutral', 0, 'plain_th'),

  ('protection', 'crystal', 'headline', 'hard',
   'ช่วยให้นิ่งขึ้นเวลาเจอเรื่องวุ่น ๆ', 5, true,
   'ground', 'sem:ground', 0, 'plain_th'),
  ('protection', 'crystal', 'fit_line', 'hard',
   'เหมาะกับคนที่สัมผัสคนเยอะและอยากให้โทนนิ่งขึ้นแบบไม่ฝืน', 5, true,
   'ground', 'sem:calm', 0, 'plain_th'),
  ('protection', 'crystal', 'bullet', 'hard',
   'ช่วยให้ตอบสนองช้าลงเมื่อใจเริ่มวอกแวก', 5, true,
   'ground', 'sem:ground', 0, 'plain_th'),
  ('protection', 'crystal', 'bullet', 'hard',
   'ช่วยประคองจังหวะภายในไม่ให้ไหลตามอารมณ์ง่ายเกินไป', 6, true,
   'ground', 'sem:neutral', 0, 'plain_th'),

  ('protection', 'crystal', 'headline', 'hard',
   'กรองแรงกวนใจจากคนรอบข้างได้ดีขึ้น', 5, true,
   'filter', 'sem:filter', 0, 'plain_th'),
  ('protection', 'crystal', 'fit_line', 'hard',
   'เหมาะกับช่วงที่อยู่กับคนเยอะแต่ไม่อยากถูกดึงไปตาม', 5, true,
   'filter', 'sem:calm', 0, 'plain_th'),
  ('protection', 'crystal', 'bullet', 'hard',
   'ช่วยให้สมาธิกลับมาที่ตัวเองได้เร็วขึ้น', 5, true,
   'filter', 'sem:filter', 0, 'plain_th'),
  ('protection', 'crystal', 'bullet', 'hard',
   'ช่วยลดความรู้สึกถูกแหย่งจากคนรอบข้าง', 6, true,
   'filter', 'sem:neutral', 0, 'plain_th'),

  ('protection', 'crystal', 'main_label', 'hard', 'เกราะเบา ๆ', 5, true,
   'shield', 'sem:barrier', 0, 'plain_th'),
  ('protection', 'crystal', 'main_label', 'hard', 'พื้นที่นิ่ง', 5, true,
   'sanctuary', 'sem:boundary', 0, 'plain_th'),
  ('protection', 'crystal', 'main_label', 'hard', 'ตั้งหลัก', 5, true,
   'ground', 'sem:ground', 0, 'plain_th'),
  ('protection', 'crystal', 'main_label', 'hard', 'กรองสัญญาณรบกวน', 5, true,
   'filter', 'sem:filter', 0, 'plain_th');
