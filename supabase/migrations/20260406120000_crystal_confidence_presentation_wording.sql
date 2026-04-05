-- Presentation-only: crystal + confidence visible copy (no routing/category code change).
-- Thai amulet/talisman confidence rows unchanged.

update public.energy_copy_templates
set
  text_th = 'เด่นเรื่องความมั่นใจและน้ำหนักในตัว'
where category_code = 'confidence'
  and object_family = 'crystal'
  and copy_type = 'headline'
  and tone = 'hard';
