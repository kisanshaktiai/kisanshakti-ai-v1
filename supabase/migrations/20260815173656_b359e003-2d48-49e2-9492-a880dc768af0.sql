INSERT INTO public.ui_translations (ui_key, language_code, display_text) VALUES
 ('mode.chemical','mr','रासायनिक'),('mode.chemical','hi','रासायनिक'),('mode.chemical','en','Chemical'),
 ('mode.mixed','mr','मिश्र'),('mode.mixed','hi','मिश्रित'),('mode.mixed','en','Mixed'),
 ('mode.organic','mr','जैविक'),('mode.organic','hi','जैविक'),('mode.organic','en','Organic'),
 ('mode.chemical_desc','mr','रासायनिक खते व औषधे वापरतो'),('mode.chemical_desc','hi','रासायनिक खाद व दवाएँ उपयोग करता हूँ'),('mode.chemical_desc','en','I use chemical fertilizers and pesticides'),
 ('mode.mixed_desc','mr','जैविक खते, पण औषधे रासायनिक'),('mode.mixed_desc','hi','जैविक खाद, पर दवाएँ रासायनिक'),('mode.mixed_desc','en','Organic fertilizers, chemical protection'),
 ('mode.organic_desc','mr','पूर्ण जैविक शेती करतो'),('mode.organic_desc','hi','पूरी तरह जैविक खेती करता हूँ'),('mode.organic_desc','en','Fully organic farming'),
 ('mode.scope_note','mr','हे फक्त या शेतासाठी लागू'),('mode.scope_note','hi','यह केवल इस खेत के लिए लागू'),('mode.scope_note','en','Applies to this land only'),
 ('advisory.organic_teaser','mr','🌿 जैविक पर्याय पहा'),('advisory.organic_teaser','hi','🌿 जैविक विकल्प देखें'),('advisory.organic_teaser','en','🌿 See organic option'),
 ('advisory.show_chemical_ask','mr','रासायनिक उपाय पाहायचा का?'),('advisory.show_chemical_ask','hi','क्या रासायनिक उपाय देखना है?'),('advisory.show_chemical_ask','en','See the chemical option?'),
 ('preference.confirm_land_ask','mr','या शेतासाठी 🌿 जैविक पर्याय नेहमी दाखवू?'),('preference.confirm_land_ask','hi','क्या इस खेत के लिए 🌿 जैविक विकल्प हमेशा दिखाएँ?'),('preference.confirm_land_ask','en','Always show 🌿 organic options for this land?'),
 ('preference.saved_land_confirm','mr','या शेतासाठी बदलले ✓'),('preference.saved_land_confirm','hi','इस खेत के लिए बदल दिया ✓'),('preference.saved_land_confirm','en','Updated for this land ✓'),
 ('common.yes','mr','हो'),('common.yes','hi','हाँ'),('common.yes','en','Yes'),
 ('common.no','mr','नाही'),('common.no','hi','नहीं'),('common.no','en','No')
ON CONFLICT (ui_key, language_code) DO UPDATE SET display_text = EXCLUDED.display_text;