-- FINAL SEED: ENERGY COPY MASTER V2 (energy_categories + energy_copy_templates + object_family_category_map)
-- energy_copy_templates has no unique on (category, family, copy_type); use DELETE then INSERT for idempotency.

-- -----------------------------
-- 1) energy_categories
-- -----------------------------
update public.energy_categories set
  name_th = 'เงินงาน',
  display_name_th = 'เงินงาน',
  short_name_th = 'เงินงาน',
  description_th = 'เด่นเรื่องเงิน งาน และโอกาส',
  priority = 10,
  updated_at = now()
where code = 'money_work';

update public.energy_categories set
  name_th = 'เสน่ห์',
  display_name_th = 'เสน่ห์',
  short_name_th = 'เสน่ห์',
  description_th = 'เด่นเรื่องเสน่ห์และแรงดึงดูด',
  priority = 20,
  updated_at = now()
where code = 'charm';

update public.energy_categories set
  name_th = 'บารมี',
  display_name_th = 'บารมี',
  short_name_th = 'บารมี',
  description_th = 'เด่นเรื่องบารมีและน้ำหนักในตัว',
  priority = 30,
  updated_at = now()
where code = 'confidence';

update public.energy_categories set
  name_th = 'คุ้มครอง',
  display_name_th = 'คุ้มครอง',
  short_name_th = 'คุ้มครอง',
  description_th = 'เด่นเรื่องคุ้มครองและกันเรื่องไม่ดี',
  priority = 40,
  updated_at = now()
where code = 'protection';

update public.energy_categories set
  is_active = false,
  updated_at = now()
where code in ('focus', 'relief');

insert into public.energy_categories
  (code, name_th, display_name_th, short_name_th, description_th, tone_default, priority, is_active)
values
  ('luck_fortune', 'โชคลาภ', 'โชคลาภ', 'โชคลาภ', 'เด่นเรื่องโชคและจังหวะดี', 'hard', 50, true),
  ('metta', 'เมตตา', 'เมตตา', 'เมตตา', 'เด่นเรื่องเมตตาและคนเปิดรับ', 'hard', 60, true)
on conflict (code) do update set
  name_th = excluded.name_th,
  display_name_th = excluded.display_name_th,
  short_name_th = excluded.short_name_th,
  description_th = excluded.description_th,
  tone_default = excluded.tone_default,
  priority = excluded.priority,
  is_active = excluded.is_active,
  updated_at = now();

-- -----------------------------
-- 2) ลบ template เก่าที่ไม่ใช้
-- -----------------------------
delete from public.energy_copy_templates
where category_code in ('focus', 'relief');

delete from public.energy_copy_templates
where object_family in ('thai_amulet', 'thai_talisman')
  and category_code in ('money_work', 'charm');

-- แทนที่ชุด Thai + Crystal ที่ seed ใหม่ (ไม่มี unique constraint บน copy)
delete from public.energy_copy_templates
where object_family in ('thai_amulet', 'thai_talisman')
  and category_code in ('luck_fortune', 'metta', 'protection', 'confidence');

delete from public.energy_copy_templates
where object_family = 'crystal'
  and category_code in ('money_work', 'charm', 'protection', 'confidence', 'luck_fortune');

-- -----------------------------
-- 4) Thai amulet / talisman
-- -----------------------------
insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('luck_fortune', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องโชคลาภและทางเงิน', 10, true),
  ('luck_fortune', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับช่วงที่อยากให้เรื่องเงินและโอกาสเริ่มเดิน', 10, true),
  ('luck_fortune', 'thai_amulet', 'bullet', 'hard', 'ช่วยเปิดทางเรื่องเงินและโอกาส', 10, true),
  ('luck_fortune', 'thai_amulet', 'bullet', 'hard', 'ช่วยดันจังหวะดีให้เข้ามาไวขึ้น', 20, true),
  ('luck_fortune', 'thai_talisman', 'headline', 'hard', 'เด่นเรื่องโชคลาภและทางเงิน', 10, true),
  ('luck_fortune', 'thai_talisman', 'fit_line', 'hard', 'เหมาะกับช่วงที่อยากให้เรื่องเงินและโอกาสเริ่มเดิน', 10, true),
  ('luck_fortune', 'thai_talisman', 'bullet', 'hard', 'ช่วยเปิดทางเรื่องเงินและโอกาส', 10, true),
  ('luck_fortune', 'thai_talisman', 'bullet', 'hard', 'ช่วยดันจังหวะดีให้เข้ามาไวขึ้น', 20, true);

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('metta', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องเมตตาและคนเปิดรับ', 10, true),
  ('metta', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับช่วงที่ต้องคุยกับคนเยอะ เจรจาให้ลื่นขึ้น', 10, true),
  ('metta', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้คนเปิดรับและเข้าหาง่ายขึ้น', 10, true),
  ('metta', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้เจรจาแล้วไม่ติดขัดง่าย', 20, true),
  ('metta', 'thai_talisman', 'headline', 'hard', 'เด่นเรื่องเมตตาและคนเปิดรับ', 10, true),
  ('metta', 'thai_talisman', 'fit_line', 'hard', 'เหมาะกับช่วงที่ต้องคุยกับคนเยอะ เจรจาให้ลื่นขึ้น', 10, true),
  ('metta', 'thai_talisman', 'bullet', 'hard', 'ช่วยให้คนเปิดรับและเข้าหาง่ายขึ้น', 10, true),
  ('metta', 'thai_talisman', 'bullet', 'hard', 'ช่วยให้เจรจาแล้วไม่ติดขัดง่าย', 20, true);

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('protection', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องคุ้มครองและกันเรื่องไม่ดี', 10, true),
  ('protection', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับคนที่อยากมีของติดตัวไว้กันแรงลบ', 10, true),
  ('protection', 'thai_amulet', 'bullet', 'hard', 'ช่วยกันแรงลบและแรงปะทะรอบตัว', 10, true),
  ('protection', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้ฟีลเหมือนมีเกราะคอยกันอยู่', 20, true),
  ('protection', 'thai_talisman', 'headline', 'hard', 'เด่นเรื่องคุ้มครองและกันเรื่องไม่ดี', 10, true),
  ('protection', 'thai_talisman', 'fit_line', 'hard', 'เหมาะกับคนที่อยากมีของติดตัวไว้กันแรงลบ', 10, true),
  ('protection', 'thai_talisman', 'bullet', 'hard', 'ช่วยกันแรงลบและแรงปะทะรอบตัว', 10, true),
  ('protection', 'thai_talisman', 'bullet', 'hard', 'ช่วยให้ฟีลเหมือนมีเกราะคอยกันอยู่', 20, true);

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('confidence', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องบารมีและน้ำหนักในตัว', 10, true),
  ('confidence', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับช่วงที่ต้องยืนให้ชัดและพูดให้คนฟัง', 10, true),
  ('confidence', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้พูดแล้วมีน้ำหนักขึ้น', 10, true),
  ('confidence', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้คนมองข้ามได้ยากขึ้น', 20, true),
  ('confidence', 'thai_talisman', 'headline', 'hard', 'เด่นเรื่องบารมีและน้ำหนักในตัว', 10, true),
  ('confidence', 'thai_talisman', 'fit_line', 'hard', 'เหมาะกับช่วงที่ต้องยืนให้ชัดและพูดให้คนฟัง', 10, true),
  ('confidence', 'thai_talisman', 'bullet', 'hard', 'ช่วยให้พูดแล้วมีน้ำหนักขึ้น', 10, true),
  ('confidence', 'thai_talisman', 'bullet', 'hard', 'ช่วยให้คนมองข้ามได้ยากขึ้น', 20, true);

-- -----------------------------
-- 5) Crystal
-- -----------------------------
insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('money_work', 'crystal', 'headline', 'hard', 'เด่นเรื่องเงิน งาน และโอกาส', 10, true),
  ('money_work', 'crystal', 'fit_line', 'hard', 'เหมาะกับช่วงที่อยากให้เรื่องงานกับรายได้เริ่มขยับ', 10, true),
  ('money_work', 'crystal', 'bullet', 'hard', 'ช่วยให้เห็นโอกาสใหม่ได้ไวขึ้น', 10, true),
  ('money_work', 'crystal', 'bullet', 'hard', 'ช่วยดันจังหวะดีเรื่องงานและรายได้', 20, true);

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('charm', 'crystal', 'headline', 'hard', 'เด่นเรื่องเสน่ห์และแรงดึงดูด', 10, true),
  ('charm', 'crystal', 'fit_line', 'hard', 'เหมาะกับช่วงที่อยากให้คนเปิดรับมากขึ้น', 10, true),
  ('charm', 'crystal', 'bullet', 'hard', 'ช่วยให้คนเข้าหาง่ายขึ้น', 10, true),
  ('charm', 'crystal', 'bullet', 'hard', 'ช่วยให้คุยแล้วบรรยากาศเปิดมากขึ้น', 20, true);

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('protection', 'crystal', 'headline', 'hard', 'เด่นเรื่องคุ้มครองและกันแรงลบ', 10, true),
  ('protection', 'crystal', 'fit_line', 'hard', 'เหมาะกับคนที่ต้องเจอคนเยอะหรือไม่อยากรับพลังแย่ ๆ', 10, true),
  ('protection', 'crystal', 'bullet', 'hard', 'ช่วยกันแรงลบและแรงปะทะที่ไม่จำเป็น', 10, true),
  ('protection', 'crystal', 'bullet', 'hard', 'ช่วยให้ไม่รับอารมณ์คนอื่นเข้าตัวง่ายเกินไป', 20, true);

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('confidence', 'crystal', 'headline', 'hard', 'เด่นเรื่องบารมีและน้ำหนักในตัว', 10, true),
  ('confidence', 'crystal', 'fit_line', 'hard', 'เหมาะกับช่วงที่ต้องพูดให้คนฟังหรือคุมสถานการณ์', 10, true),
  ('confidence', 'crystal', 'bullet', 'hard', 'ช่วยให้พูดแล้วมีน้ำหนักขึ้น', 10, true),
  ('confidence', 'crystal', 'bullet', 'hard', 'ช่วยให้ยืนชัดขึ้นเวลาเจอสถานการณ์กดดัน', 20, true);

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('luck_fortune', 'crystal', 'headline', 'hard', 'เด่นเรื่องโชคและจังหวะดี', 10, true),
  ('luck_fortune', 'crystal', 'fit_line', 'hard', 'เหมาะกับช่วงที่อยากให้โอกาสใหม่ ๆ เข้ามาง่ายขึ้น', 10, true),
  ('luck_fortune', 'crystal', 'bullet', 'hard', 'ช่วยให้เจอจังหวะดีได้บ่อยขึ้น', 10, true),
  ('luck_fortune', 'crystal', 'bullet', 'hard', 'ช่วยให้โอกาสเข้ามาแบบไม่ฝืดเกินไป', 20, true);

-- -----------------------------
-- 6) object_family_category_map
-- -----------------------------
update public.object_family_category_map
set is_active = false
where object_family in ('thai_amulet', 'thai_talisman')
  and category_code in ('money_work', 'charm');

update public.object_family_category_map
set is_active = false
where object_family = 'crystal'
  and category_code in ('focus', 'relief', 'metta');

insert into public.object_family_category_map
  (object_family, category_code, priority, is_active)
values
  ('thai_amulet', 'luck_fortune', 10, true),
  ('thai_amulet', 'metta', 20, true),
  ('thai_amulet', 'protection', 30, true),
  ('thai_amulet', 'confidence', 40, true),
  ('thai_talisman', 'luck_fortune', 10, true),
  ('thai_talisman', 'metta', 20, true),
  ('thai_talisman', 'protection', 30, true),
  ('thai_talisman', 'confidence', 40, true)
on conflict (object_family, category_code) do update set
  priority = excluded.priority,
  is_active = excluded.is_active;

insert into public.object_family_category_map
  (object_family, category_code, priority, is_active)
values
  ('crystal', 'money_work', 10, true),
  ('crystal', 'charm', 20, true),
  ('crystal', 'protection', 30, true),
  ('crystal', 'confidence', 40, true),
  ('crystal', 'luck_fortune', 50, true)
on conflict (object_family, category_code) do update set
  priority = excluded.priority,
  is_active = excluded.is_active;
