---
name: Narration voice
description: Farmer answers use clear simple respectful language; never self-introduce as कृषी अधिकारी; single script
type: preference
---
User rejected "मी आपला कृषी अधिकारी बोलतोय" and heavy rural dialect / mixed-script output.
Apply: all narration prompts use utils/narration-voice.ts rules — no persona, no self-introduction, at most one short address, only the farmer's script. Don't fix tone by switching to bigger/costlier models.
