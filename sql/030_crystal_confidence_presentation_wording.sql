-- Mirror of supabase/migrations/20260406120000_crystal_confidence_presentation_wording.sql

update public.energy_copy_templates
set
  text_th = 'เด่นเรื่องความมั่นใจและน้ำหนักในตัว'
where category_code = 'confidence'
  and object_family = 'crystal'
  and copy_type = 'headline'
  and tone = 'hard';
