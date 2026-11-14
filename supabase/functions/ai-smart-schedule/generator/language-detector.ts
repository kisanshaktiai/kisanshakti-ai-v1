// 2026-11-15 — Deno-only: registers the trigram language model used by language-guard.ts.
// Imported once by the function entry point. Kept out of the pure modules so the unit-test runner,
// which cannot resolve `npm:` specifiers, can still import the composer and the sweeper.
import { francAll } from "npm:franc-min@6.2.0";
import { setLanguageDetector, type DetectAll } from "./language-guard.ts";

setLanguageDetector(francAll as unknown as DetectAll);
