-- Crystal-only category: spiritual_growth (พลังงานสูง) — not for thai_amulet / thai_talisman

insert into public.energy_categories
  (code, name_th, display_name_th, short_name_th, description_th, tone_default, priority, is_active)
values
  (
    'spiritual_growth',
    'พลังงานสูง',
    'พลังงานสูง',
    'พลังงานสูง',
    'เด่นเรื่องพลังงานสูงและการยกระดับตัวเอง',
    'hard',
    60,
    true
  )
on conflict (code) do update set
  name_th = excluded.name_th,
  display_name_th = excluded.display_name_th,
  short_name_th = excluded.short_name_th,
  description_th = excluded.description_th,
  tone_default = excluded.tone_default,
  priority = excluded.priority,
  is_active = excluded.is_active,
  updated_at = now();

delete from public.energy_copy_templates
where category_code = 'spiritual_growth'
  and object_family = 'crystal';

insert into public.energy_copy_templates
  (category_code, object_family, copy_type, tone, text_th, weight, is_active)
values
  ('spiritual_growth', 'crystal', 'headline', 'hard', 'เด่นเรื่องพลังงานสูงและการยกระดับตัวเอง', 10, true),
  ('spiritual_growth', 'crystal', 'fit_line', 'hard', 'เหมาะกับช่วงที่อยากเร่งการเปลี่ยนแปลงในชีวิต', 10, true),
  ('spiritual_growth', 'crystal', 'bullet', 'hard', 'ช่วยกระตุ้นจักระที่ 6 และ 7 และเพิ่มการหยั่งรู้', 10, true),
  ('spiritual_growth', 'crystal', 'bullet', 'hard', 'ช่วยเร่งการเปลี่ยนแปลงให้ขยับชัดขึ้น', 20, true);

insert into public.object_family_category_map
  (object_family, category_code, priority, is_active)
values
  ('crystal', 'spiritual_growth', 60, true)
on conflict (object_family, category_code) do update set
  priority = excluded.priority,
  is_active = excluded.is_active;
