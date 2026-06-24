INSERT INTO public.irrigation_types (value, label, description, label_hi, label_mr, label_pa, label_ta, label_te, label_bn, label_gu, label_kn, label_ml, label_or, label_as, label_ur, label_sa)
VALUES
  ('manual', 'Manual Irrigation', 'Hand watering or bucket irrigation', 'मैनुअल सिंचाई', 'हाताने पाणी देणे', 'ਹੱਥੀਂ ਸਿੰਚਾਈ', 'கைமுறை நீர்ப்பாசனம்', 'మాన్యువల్ నీటిపారుదల', 'ম্যানুয়াল সেচ', 'મેન્યુઅલ સિંચાઈ', 'ಕೈ ನೀರಾವರಿ', 'മാനുവൽ ജലസേചനം', 'ହାତ ଜଳସେଚନ', 'হাতেৰে পানী দিয়া', 'دستی آبپاشی', 'हस्तसिञ्चनम्'),
  ('flood', 'Flood Irrigation', 'Field is flooded with water', 'बाढ़ सिंचाई', 'पाणी साठवून सिंचन', 'ਹੜ੍ਹ ਸਿੰਚਾਈ', 'வெள்ள நீர்ப்பாசனம்', 'వరద నీటిపారుదల', 'প্লাবন সেচ', 'પૂર સિંચાઈ', 'ಪ್ರವಾಹ ನೀರಾವರಿ', 'വെള്ളപ്പൊക്ക ജലസേചനം', 'ବନ୍ୟା ଜଳସେଚନ', 'বানপানী সিঁচ', 'سیلابی آبپاشی', 'आप्लावनसिञ्चनम्')
ON CONFLICT (value) DO NOTHING;

UPDATE public.lands SET irrigation_type = 'manual' WHERE irrigation_type = 'Manual';