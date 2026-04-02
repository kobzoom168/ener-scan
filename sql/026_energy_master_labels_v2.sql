-- Master label set v2: Thai / เครื่องราง = โชคลาภ, เมตตา, คุ้มครอง, บารมี | Crystal = เงินงาน, เสน่ห์, คุ้มครอง, บารมี, โชคลาภ
-- Deactivates focus/relief; headline copy avoids symptom-style main headings (product spec).

insert into public.energy_categories
  (code, name_th, display_name_th, short_name_th, description_th, tone_default, priority, is_active)
values
  (
    'luck_fortune',
    'โชคลาภ',
    'โชคลาภ',
    'โชคลาภ',
    'เด่นเรื่องโชคลาภและทางเงิน',
    'hard',
    12,
    true
  ),
  (
    'metta',
    'เมตตา',
    'เมตตา',
    'เมตตา',
    'เด่นเรื่องเมตตาและคนเปิดรับ',
    'hard',
    22,
    true
  )
on conflict (code) do update set
  name_th = excluded.name_th,
  display_name_th = excluded.display_name_th,
  short_name_th = excluded.short_name_th,
  description_th = excluded.description_th,
  tone_default = excluded.tone_default,
  priority = excluded.priority,
  is_active = true,
  updated_at = now();

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

delete from public.energy_copy_templates
where category_code in ('focus', 'relief');

delete from public.energy_copy_templates
where object_family in ('thai_amulet', 'thai_talisman');

-- Thai / เครื่องราง: โชคลาภ, เมตตา, คุ้มครอง, บารมี
insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight)
values
  ('luck_fortune', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องโชคลาภและทางเงิน', 10),
  ('luck_fortune', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับคนที่อยากให้เรื่องเงินกับโอกาสเริ่มเดิน', 10),
  ('luck_fortune', 'thai_amulet', 'bullet', 'hard', 'ช่วยเปิดทางเรื่องเงินและโอกาส', 10),
  ('luck_fortune', 'thai_amulet', 'bullet', 'hard', 'ช่วยดันจังหวะดีให้เข้ามาไวขึ้น', 20),
  ('metta', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องเมตตาและคนเปิดรับ', 10),
  ('metta', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับคนที่อยากให้คุยง่าย เจรจาง่าย คนเอ็นดู', 10),
  ('metta', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้คนเปิดรับและเข้าหาง่ายขึ้น', 10),
  ('metta', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้เจรจาแล้วไม่ติดขัดง่าย', 20),
  ('protection', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องคุ้มครองและกันเรื่องไม่ดี', 10),
  ('protection', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับคนที่อยากมีของติดตัวไว้กันเรื่องไม่ดี', 10),
  ('protection', 'thai_amulet', 'bullet', 'hard', 'ช่วยกันแรงลบและแรงปะทะรอบตัว', 10),
  ('protection', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้ฟีลเหมือนมีเกราะคอยกันอยู่', 20),
  ('confidence', 'thai_amulet', 'headline', 'hard', 'เด่นเรื่องบารมีและน้ำหนักในตัว', 10),
  ('confidence', 'thai_amulet', 'fit_line', 'hard', 'เหมาะกับช่วงที่ต้องยืนชัดและพูดให้คนฟัง', 10),
  ('confidence', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้พูดแล้วมีน้ำหนักขึ้น', 10),
  ('confidence', 'thai_amulet', 'bullet', 'hard', 'ช่วยให้คนมองข้ามได้ยากขึ้น', 20);

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight)
select category_code, 'thai_talisman', copy_type, tone, text_th, weight
from public.energy_copy_templates
where object_family = 'thai_amulet';

-- Crystal: เงินงาน, เสน่ห์, คุ้มครอง, บารมี, โชคลาภ
delete from public.energy_copy_templates
where object_family = 'crystal';

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight)
values
  ('money_work', 'crystal', 'headline', 'hard', 'เด่นเรื่องเงิน งาน และโอกาส', 10),
  ('money_work', 'crystal', 'fit_line', 'hard', 'เหมาะกับคนที่อยากให้เรื่องเงินและงานเริ่มขยับ', 10),
  ('money_work', 'crystal', 'bullet', 'hard', 'ช่วยให้เห็นช่องทางใหม่ได้ไวขึ้น', 10),
  ('money_work', 'crystal', 'bullet', 'hard', 'ช่วยดันจังหวะดีเรื่องงานและโอกาส', 20),
  ('charm', 'crystal', 'headline', 'hard', 'เด่นเรื่องเสน่ห์และแรงดึงดูด', 10),
  ('charm', 'crystal', 'fit_line', 'hard', 'เหมาะกับคนที่อยากให้คนเปิดรับมากขึ้น', 10),
  ('charm', 'crystal', 'bullet', 'hard', 'ช่วยให้คนเข้าหาง่ายขึ้น', 10),
  ('charm', 'crystal', 'bullet', 'hard', 'ช่วยให้คุยแล้วบรรยากาศเปิดมากขึ้น', 20),
  ('protection', 'crystal', 'headline', 'hard', 'เด่นเรื่องคุ้มครองและกันเรื่องไม่ดี', 10),
  ('protection', 'crystal', 'fit_line', 'hard', 'เหมาะกับคนที่ต้องเจอคนเยอะและไม่อยากรับพลังมั่วเข้าตัว', 10),
  ('protection', 'crystal', 'bullet', 'hard', 'ช่วยกันแรงลบและแรงปะทะที่ไม่จำเป็น', 10),
  ('protection', 'crystal', 'bullet', 'hard', 'ช่วยให้ไม่รับอารมณ์คนอื่นเข้าตัวง่ายเกินไป', 20),
  ('confidence', 'crystal', 'headline', 'hard', 'เด่นเรื่องบารมีและน้ำหนักในตัว', 10),
  ('confidence', 'crystal', 'fit_line', 'hard', 'เหมาะกับช่วงที่ต้องพูดให้คนฟังและตัดสินใจให้คม', 10),
  ('confidence', 'crystal', 'bullet', 'hard', 'ช่วยให้พูดแล้วมีน้ำหนักขึ้น', 10),
  ('confidence', 'crystal', 'bullet', 'hard', 'ช่วยให้ยืนชัดขึ้นเวลาเจอสถานการณ์กดดัน', 20),
  ('luck_fortune', 'crystal', 'headline', 'hard', 'เด่นเรื่องโชคลาภและทางเงิน', 10),
  ('luck_fortune', 'crystal', 'fit_line', 'hard', 'เหมาะกับคนที่อยากให้โอกาสและจังหวะดีเข้ามาไวขึ้น', 10),
  ('luck_fortune', 'crystal', 'bullet', 'hard', 'ช่วยเปิดทางเรื่องเงินและโอกาส', 10),
  ('luck_fortune', 'crystal', 'bullet', 'hard', 'ช่วยดันจังหวะดีให้เข้ามาไวขึ้น', 20);

delete from public.object_family_category_map
where object_family in ('thai_amulet', 'thai_talisman', 'crystal');

insert into public.object_family_category_map (object_family, category_code, priority)
values
  ('thai_amulet', 'luck_fortune', 10),
  ('thai_amulet', 'metta', 20),
  ('thai_amulet', 'protection', 30),
  ('thai_amulet', 'confidence', 40),
  ('thai_talisman', 'luck_fortune', 10),
  ('thai_talisman', 'metta', 20),
  ('thai_talisman', 'protection', 30),
  ('thai_talisman', 'confidence', 40),
  ('crystal', 'money_work', 10),
  ('crystal', 'charm', 20),
  ('crystal', 'protection', 30),
  ('crystal', 'confidence', 40),
  ('crystal', 'luck_fortune', 50);
