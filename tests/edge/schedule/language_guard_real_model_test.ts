// The same-script language guard with the REAL trigram model (franc-min, registered by the function's
// entry point through language-detector.ts), on the real card text of live schedule 4fa451a0.
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import "../../../supabase/functions/ai-smart-schedule/generator/language-detector.ts";
import { getLanguageDetector, wrongSameScriptLanguage } from "../../../supabase/functions/ai-smart-schedule/generator/language-guard.ts";

const HINDI_CARD = [
  "भात की पौधशाला",
  "अपने जिले के लिए सुझाया हुआ प्रमाणित बीज लें। बीज को पानी में डालें। जो बीज ऊपर तैरें, उन्हें निकाल दें। फिर ऊँची क्यारी पर बोएँ।",
  "भात (Rice Indrayani) की पौधशाला में बोएँ। 3.51 acre के लिए 49.72 kg बीज लें।",
].join(" \n ");
const MARATHI_CARDS = [
  "रोपवाटिका पाणी \n पेरणीनंतर day 0 ते day 24 पर्यंत साधारण दर 2 दिवसांनी शेतातील पाणी पाहा. शेताला पाणी हवे असेल तेव्हा पाणी द्या.",
  "भाताची रोपे \n बीजप्रक्रिया केल्यानंतर भाताचे बीजप्रक्रिया करा. महाराष्ट्रात Azotobacter 25 g आणि phosphorus-solubilising bacteria 25 g प्रत्येक kilogram बियाण्यासाठी वापरा.",
  "जस्त खत द्या \n रोपे लावण्याच्या अगोदर चिखल केलेल्या शेतात Zinc Sulphate (ZnSO4) कोरड्या वाळूत मिसळून समान पसरवा. \n Zinc Sulphate (ZnSO4) 10 किलो प्रति एकर, 20 किलो कोरड्या वाळूसोबत मिसळून द्या.",
  "जमीन तयार करणे \n पेरणीनंतर 15 दिवसांनी जमीन तयार करण्याचे काम करा. हे काम 30 पर्यंत करा.",
  "नर्सरीसाठी बियाणे तयार करणे \n प्रमाणित इंद्रायणी बियाणे निवडून उंच वाफ्यावर पेरा, म्हणजे निरोगी रोपे तयार होतील. \n तुमच्या जिल्ह्यासाठी शिफारस केलेले या वाणाचे प्रमाणित बियाणे घ्या.",
];

Deno.test("the entry-point import registers the trigram model", () => {
  assert(getLanguageDetector() !== null);
});

Deno.test("the Hindi nursery card of 4fa451a0 is rejected for a Marathi schedule", () => {
  assertEquals(wrongSameScriptLanguage(HINDI_CARD, "mr"), "hi");
});

Deno.test("real Marathi cards (4fa451a0, e59d281c) are accepted", () => {
  for (const card of MARATHI_CARDS) assertEquals(wrongSameScriptLanguage(card, "mr"), null, card.slice(0, 30));
});

Deno.test("a Hindi schedule accepts the Hindi card", () => {
  assertEquals(wrongSameScriptLanguage(HINDI_CARD, "hi"), null);
});
