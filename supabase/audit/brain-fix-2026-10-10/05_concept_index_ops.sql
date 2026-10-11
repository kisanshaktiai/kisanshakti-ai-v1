-- ════════════════════════════════════════════════════════════════════════
-- 05_concept_index_ops.sql  (2026-10-11)
-- Repo: kisanshakti-ai-v1 (farmer app) · Supabase project qfklkkzxemsbeniyugiz
--
-- Runs the brain-concept-indexer edge function FROM SQL (pg_net), signed with the vault key
-- brain_concept_indexer_key (created by migration 20261010190000_brain_concept_index.sql).
-- Needs: that migration applied AND the function brain-concept-indexer deployed.
--
-- pg_net is asynchronous: each http_post returns a request id at once; read the reply a few
-- seconds later with statement R (net._http_response keeps replies for a while).
-- None of these calls changes the farmer's chat: they fill and test the concept index only.
--
-- ORDER: A (refresh) → B (embed; repeat until "remaining_work": false) → C (status)
--        → D (eval of the 121 graded questions) → E (read the eval rows).
-- ════════════════════════════════════════════════════════════════════════

-- A) refresh the index from observation_aliases / observation_translations / intent_translations
SELECT net.http_post(
  url := 'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/brain-concept-indexer',
  headers := jsonb_build_object('Content-Type', 'application/json',
                                'Authorization', 'Bearer ' || public.get_sweep_key('brain_concept_indexer_key')),
  body := '{"action":"refresh"}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;

-- B) embed (about 5,000 phrases per call within the function's time budget) — repeat until done
SELECT net.http_post(
  url := 'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/brain-concept-indexer',
  headers := jsonb_build_object('Content-Type', 'application/json',
                                'Authorization', 'Bearer ' || public.get_sweep_key('brain_concept_indexer_key')),
  body := '{"action":"embed","maxRows":6000,"budgetMs":120000}'::jsonb,
  timeout_milliseconds := 150000
) AS request_id;

-- C) status
SELECT net.http_post(
  url := 'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/brain-concept-indexer',
  headers := jsonb_build_object('Content-Type', 'application/json',
                                'Authorization', 'Bearer ' || public.get_sweep_key('brain_concept_indexer_key')),
  body := '{"action":"status"}'::jsonb,
  timeout_milliseconds := 60000
) AS request_id;

-- R) read a reply: put the request id from A / B / C / D
SELECT id, status_code, timed_out, error_msg, left(content, 2000) AS content
FROM net._http_response WHERE id = 0;   -- ← request id

-- D) eval: the 121 typed farmer questions of 03_farmer_questions_graded_baseline.csv (id = row number)
SELECT net.http_post(
  url := 'https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/brain-concept-indexer',
  headers := jsonb_build_object('Content-Type', 'application/json',
                                'Authorization', 'Bearer ' || public.get_sweep_key('brain_concept_indexer_key')),
  body := '{
 "action": "eval",
 "label": "answerkey-2026-10-10",
 "limit": 10,
 "questions": [
  {
   "id": "1",
   "text": "aamchya bhagat konata tandul changala yeil"
  },
  {
   "id": "2",
   "text": "ata konate khat dyave"
  },
  {
   "id": "3",
   "text": "bhat pik kapanila ajun kiti divas baki"
  },
  {
   "id": "4",
   "text": "can salicylic acid help soybean under drought or high temperature?"
  },
  {
   "id": "5",
   "text": "give me detailed schedule for rice"
  },
  {
   "id": "6",
   "text": "growth stages?"
  },
  {
   "id": "7",
   "text": "how do i do seed dressing / seed treatment for soybean?"
  },
  {
   "id": "8",
   "text": "how do i prune a fig tree?"
  },
  {
   "id": "9",
   "text": "kahi thikani bhat pik valat aahe"
  },
  {
   "id": "10",
   "text": "kahi thikani pik pivale zale aahe"
  },
  {
   "id": "11",
   "text": "kahi thikani tudtude disat aahet kay karu"
  },
  {
   "id": "12",
   "text": "kds 726 he kay aaahe?"
  },
  {
   "id": "13",
   "text": "konate pik ghevu"
  },
  {
   "id": "14",
   "text": "majha kolhapur jilha aahe"
  },
  {
   "id": "15",
   "text": "majhya pikachi kaay sthiti aahe"
  },
  {
   "id": "16",
   "text": "majya shetata me safarchnad lagvad karu shakto ka?"
  },
  {
   "id": "17",
   "text": "mala gahu pik ghyache aahe ani konta van chnagala aahe"
  },
  {
   "id": "18",
   "text": "mala kds 726   याचे पिक घ्यायचे आहे संपूर्ण माहिती दे"
  },
  {
   "id": "19",
   "text": "mala rice pik gyache aahe"
  },
  {
   "id": "20",
   "text": "mi kanata us lavu"
  },
  {
   "id": "21",
   "text": "mi konata tandul van nivadu"
  },
  {
   "id": "22",
   "text": "mi konata uas laavu"
  },
  {
   "id": "23",
   "text": "mi konta us pik ghevu? koanti jat jast income dete?"
  },
  {
   "id": "24",
   "text": "my rice crop leaves have circular brown spots with grey centres. what should i do?"
  },
  {
   "id": "25",
   "text": "paaus nasale mule ajun bhat ugavale nahi"
  },
  {
   "id": "26",
   "text": "pik valat aahe kay karu?"
  },
  {
   "id": "27",
   "text": "pikala konte khat devu"
  },
  {
   "id": "28",
   "text": "pikat khup tan aale aahe"
  },
  {
   "id": "29",
   "text": "pn mi maharashtra madhye rahato? mala bhihar cha tandul kasa milel"
  },
  {
   "id": "30",
   "text": "rice growth stages?"
  },
  {
   "id": "31",
   "text": "rice pik kiti divasche aahe"
  },
  {
   "id": "32",
   "text": "sadhya bhatachi kaay sthiti aahe"
  },
  {
   "id": "33",
   "text": "sadhya konate khat devu"
  },
  {
   "id": "34",
   "text": "sadhya pikachi kaay sthiti aahe"
  },
  {
   "id": "35",
   "text": "soybean seed rate and spacing"
  },
  {
   "id": "36",
   "text": "udya favarani ghevu kay"
  },
  {
   "id": "37",
   "text": "what are the symptoms of yellow mosaic virus in soybean?"
  },
  {
   "id": "38",
   "text": "what is a sub-soiler and why is it recommended for soybean?"
  },
  {
   "id": "39",
   "text": "what is rice blast?"
  },
  {
   "id": "40",
   "text": "what is the current growth stage and status of my rice crop on shinghan mal?"
  },
  {
   "id": "41",
   "text": "what is the seed rate for soybean per hectare and the best sowing time?"
  },
  {
   "id": "42",
   "text": "what is the seed rate for wheat?"
  },
  {
   "id": "43",
   "text": "which pests attack rice?"
  },
  {
   "id": "44",
   "text": "which soybean variety matures in about 97 days for the central zone?"
  },
  {
   "id": "45",
   "text": "why should i use a power sprayer and when should i spray to protect beneficial insects?"
  },
  {
   "id": "46",
   "text": "ya ranant kay pik aahe"
  },
  {
   "id": "47",
   "text": "ya ranat konate pik aahe"
  },
  {
   "id": "48",
   "text": "आता कोणते खत द्यावे"
  },
  {
   "id": "49",
   "text": "आता खत द्यावे काय"
  },
  {
   "id": "50",
   "text": "आता खत द्यावे काय आणि किती द्यावे"
  },
  {
   "id": "51",
   "text": "आता या शेतात काय खत देवू"
  },
  {
   "id": "52",
   "text": "ऊस पिकाला काय खत देवू"
  },
  {
   "id": "53",
   "text": "ऊसाला पाणी कधी द्यायचे?"
  },
  {
   "id": "54",
   "text": "कमी कालावधी व  कमी पाण्याचा भात पिक कोणते"
  },
  {
   "id": "55",
   "text": "कापणीला अजून किती दिवस?"
  },
  {
   "id": "56",
   "text": "कोणती फवारणी घ्यावी"
  },
  {
   "id": "57",
   "text": "खताचा पुढचा हप्ता कधी आणि किती द्यावा?"
  },
  {
   "id": "58",
   "text": "खराब उगवण"
  },
  {
   "id": "59",
   "text": "चांगली उगवण होणे साठी काय खत द्यावे?"
  },
  {
   "id": "60",
   "text": "जास्त उस उत्पादन साठी काय करावे, संपूर्ण नियोजन हवे"
  },
  {
   "id": "61",
   "text": "तन जास्त आले आहे काय करावे"
  },
  {
   "id": "62",
   "text": "नवीन कोणते पिक घेवू ?"
  },
  {
   "id": "63",
   "text": "पाऊस नसले मुळ भात उगवले नाही, काय करावे?"
  },
  {
   "id": "64",
   "text": "पानांवर तपकिरी ठिपके / करपा दिसतोय"
  },
  {
   "id": "65",
   "text": "पानांवर हिऱ्यासारखे डाग आहेत"
  },
  {
   "id": "66",
   "text": "पाने पिवळी पडत आहेत"
  },
  {
   "id": "67",
   "text": "पिक अजून उगवले नाही"
  },
  {
   "id": "68",
   "text": "पिक अद्याप उगवले नाही"
  },
  {
   "id": "69",
   "text": "पिक पिवळे पडले आहे काय करावे"
  },
  {
   "id": "70",
   "text": "पिकाची ऊंची कमी आहे"
  },
  {
   "id": "71",
   "text": "पिकाची वाढ कमी आहे"
  },
  {
   "id": "72",
   "text": "पिकाची वाढ कमी आहे आणि झाडे कोलमडत आहेत"
  },
  {
   "id": "73",
   "text": "पिकाची वाढ कमी आहे, काय करावे"
  },
  {
   "id": "74",
   "text": "पिकाची वाढ कमी आहे, पाने पिवळी पडत आहेत आणि झाडे कोलमडत आहेत"
  },
  {
   "id": "75",
   "text": "पिकाची वाढ कमी आहे."
  },
  {
   "id": "76",
   "text": "पिकाच्या या अवस्थेत काय  फवारण घ्यावी"
  },
  {
   "id": "77",
   "text": "पिकाला जास्त फुटावा नाही काय karave"
  },
  {
   "id": "78",
   "text": "पीक उगवत नाही का?"
  },
  {
   "id": "79",
   "text": "पीक ओंबी धरायच्या अवस्थेत आहे, आता खत कोणतं?"
  },
  {
   "id": "80",
   "text": "पीक पिवळं पडलंय, काय करू?"
  },
  {
   "id": "81",
   "text": "पीक पिवळे पडले आहे काय करावे"
  },
  {
   "id": "82",
   "text": "पोटरी अवस्थेत पाणी किती ठेवायचं?"
  },
  {
   "id": "83",
   "text": "भात अजून उगवले नाही"
  },
  {
   "id": "84",
   "text": "भात अद्याप उगवले नाही"
  },
  {
   "id": "85",
   "text": "भात कापणी कधी करावी"
  },
  {
   "id": "86",
   "text": "भात कापणीला किती दिवस बाकी? पीक तयार आहे का?"
  },
  {
   "id": "87",
   "text": "भात फक्त काही ठिकाणी उगवले आहे"
  },
  {
   "id": "88",
   "text": "भाताची वाढ होत नाही."
  },
  {
   "id": "89",
   "text": "भाताला कोणती फवारणी घ्यावी"
  },
  {
   "id": "90",
   "text": "भातावर कोणत्या किडी येतात?"
  },
  {
   "id": "91",
   "text": "माझ्या खारी जमिनीत आता काय करू? मागच्या वेळी गहू होते"
  },
  {
   "id": "92",
   "text": "माझ्या पिकाला कोणते खत द्यावे?"
  },
  {
   "id": "93",
   "text": "माझ्या पिकाला कोणते खत द्यावे? 10:42 pm"
  },
  {
   "id": "94",
   "text": "माझ्या भागात गहू पेरण्यासाठी सर्वोत्तम वेळ कोणती?"
  },
  {
   "id": "95",
   "text": "माझ्या भाताची रोपे खुंटली आहेत आणि पाने पिवळी पडत आहेत"
  },
  {
   "id": "96",
   "text": "मी कोणता उस लावू"
  },
  {
   "id": "97",
   "text": "मी सोयाबीन पिक कसे घेवू आणू जास्त उत्पन्न देणारे बी कोणते"
  },
  {
   "id": "98",
   "text": "या टप्प्यावर काय खत द्यावं?"
  },
  {
   "id": "99",
   "text": "या शेतात कोणते नवीन पिक घेवू?"
  },
  {
   "id": "100",
   "text": "या शेतात कोणते पिक आहे"
  },
  {
   "id": "101",
   "text": "या शेतात कोणते पिक घ्यावे?"
  },
  {
   "id": "102",
   "text": "या शेतात कोणते पिक होते?"
  },
  {
   "id": "103",
   "text": "या शेतात खूप तन आले आहे"
  },
  {
   "id": "104",
   "text": "या शेतात तन येवू नये म्हणून काय मारावे ?"
  },
  {
   "id": "105",
   "text": "या शेतातील पिक अजून उगवले नाही"
  },
  {
   "id": "106",
   "text": "या शेतातील पिक अजून उगवले नाही 01:06 pm"
  },
  {
   "id": "107",
   "text": "या शेतातील पिक अजून उगवले नाही 11:13 pm"
  },
  {
   "id": "108",
   "text": "युरिया किती प्रमाणात टाकू?"
  },
  {
   "id": "109",
   "text": "रोपे बारीक दिसत आहेत, कोणते खत द्यावे?"
  },
  {
   "id": "110",
   "text": "शेतात खूप तन आले आहे"
  },
  {
   "id": "111",
   "text": "शेतात गॅप दिसत आहेत"
  },
  {
   "id": "112",
   "text": "शेतात जमिनी मध्ये खूप भेगा पडल्या आहेत"
  },
  {
   "id": "113",
   "text": "शेतात तण खूप आले आहेत, कोणते तणनाशक फवारावे"
  },
  {
   "id": "114",
   "text": "शेतात तन जास्त आले आहे काय वापरावे"
  },
  {
   "id": "115",
   "text": "सध्या उसाला काय खत देवू"
  },
  {
   "id": "116",
   "text": "सध्या पिकाची काय स्थिति आहे"
  },
  {
   "id": "117",
   "text": "सध्या पिकाची काय स्थिति आहे."
  },
  {
   "id": "118",
   "text": "सोयाबीन मध्ये ही kds जात आहे का आणि कोणती आहे"
  },
  {
   "id": "119",
   "text": "सोयाबीन में पीला मोज़ेक रोग के लक्षण क्या हैं?"
  },
  {
   "id": "120",
   "text": "सोयाबीनसाठी बियाणे किती लागते?"
  },
  {
   "id": "121",
   "text": "सोयाबीनसाठी हेक्टरी बियाणे दर किती आणि पेरणी कधी करावी?"
  }
 ]
}'::jsonb,
  timeout_milliseconds := 150000
) AS request_id;

-- E) eval rows: top 5 candidates per question (read-only)
SELECT split_part(status_detail, ':', 2)::int AS q_id, query_text, script_class,
       (SELECT string_agg((c->>'kind') || ':' || (c->>'code') || ' s=' || coalesce(round((c->>'sem_score')::numeric, 2)::text, '-'), ' | ')
          FROM (SELECT c FROM jsonb_array_elements(candidates) WITH ORDINALITY t(c, n) ORDER BY n LIMIT 5) x) AS top5
FROM public.brain_concept_shadow_log
WHERE run_kind = 'eval' AND status_detail LIKE 'answerkey-2026-10-10:%'
ORDER BY 1;
