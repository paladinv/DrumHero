import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const contentPath = path.join(root, "shared/mobile/v1/drum-content.json");
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const localizationPath = path.join(root, "lib/locales.ts");
const localizationOutput = ts.transpileModule(fs.readFileSync(localizationPath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const teachingPath = path.join(root, "lib/teaching-locales.ts");
const teachingOutput = ts.transpileModule(fs.readFileSync(teachingPath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const teachingModule = { exports: {} };
vm.runInNewContext(teachingOutput, { module: teachingModule, exports: teachingModule.exports }, { filename: teachingPath });
const dashboardPath = path.join(root, "lib/dashboard-locales.ts");
const dashboardOutput = ts.transpileModule(fs.readFileSync(dashboardPath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const dashboardModule = { exports: {} };
vm.runInNewContext(dashboardOutput, { module: dashboardModule, exports: dashboardModule.exports }, { filename: dashboardPath });
const localizationModule = { exports: {} };
vm.runInNewContext(localizationOutput, { module: localizationModule, exports: localizationModule.exports, require: (specifier) => specifier.includes("dashboard-locales") ? dashboardModule.exports : teachingModule.exports }, { filename: "lib/locales.ts" });
const curriculumSource = fs.readFileSync(path.join(root, "lib/curriculum.ts"), "utf8");
const curriculumOutput = ts.transpileModule(curriculumSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const curriculumModule = { exports: {} };
vm.runInNewContext(curriculumOutput, { module: curriculumModule, exports: curriculumModule.exports }, { filename: "lib/curriculum.ts" });
const songLibraryPath = path.join(root, "lib/song-library.ts");
const songLibraryOutput = ts.transpileModule(fs.readFileSync(songLibraryPath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const songLibraryModule = { exports: {} };
vm.runInNewContext(songLibraryOutput, { module: songLibraryModule, exports: songLibraryModule.exports, require: (specifier) => {
  if (specifier === "./song-library-improvements") return { goalAccepts: () => true, normalizeGoals: (goals) => goals };
  if (specifier === "./song-builder-tools") return { normalizeTempoAnchors: (anchors) => anchors };
  if (specifier === "./song-library-next") return { normalizePresets: (items) => items, normalizeSavedSearches: (items) => items, normalizeSetlistEntries: (items) => items };
  if (specifier === "./custom-grooves") return { parseCustomGrooves: () => [] };
  if (specifier === "./audio") return { DEFAULT_DRUM_MIX: { levels: {}, pan: {}, sampleIndex: {}, pitch: {}, decay: {}, muted: {}, solo: "" } };
  if (specifier === "./types") return { SONG_INSTRUMENTS: ["kick", "snare", "hihat", "openhat", "ride", "rimshot", "tom", "crash", "cowbell", "shaker", "tambourine", ...Array.from({ length: 8 }, (_, index) => `custom${index + 1}`)] };
  throw new Error(`Unexpected song-library dependency: ${specifier}`);
} }, { filename: songLibraryPath });
const guideSource = fs.readFileSync(path.join(root, "lib/lesson-guides.ts"), "utf8");
const guideOutput = ts.transpileModule(guideSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const guideModule = { exports: {} };
vm.runInNewContext(guideOutput, { module: guideModule, exports: guideModule.exports }, { filename: "lib/lesson-guides.ts" });
const displaySource = fs.readFileSync(path.join(root, "lib/teaching-pattern-display.ts"), "utf8");
const displayOutput = ts.transpileModule(displaySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const displayModule = { exports: {} };
vm.runInNewContext(displayOutput, { module: displayModule, exports: displayModule.exports, require: () => curriculumModule.exports }, { filename: "lib/teaching-pattern-display.ts" });
const contentSource = fs.readFileSync(path.join(root, "lib/teaching-content-locales.ts"), "utf8");
const contentOutput = ts.transpileModule(contentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const contentModule = { exports: {} };
vm.runInNewContext(contentOutput, { module: contentModule, exports: contentModule.exports, require: (specifier) => specifier.includes("curriculum") ? curriculumModule.exports : specifier.includes("lesson-guides") ? guideModule.exports : specifier.includes("teaching-pattern-display") ? displayModule.exports : localizationModule.exports }, { filename: "lib/teaching-content-locales.ts" });
const teachingTranslations = contentModule.exports.teachingContentTranslations();
const expectedCatalogs = Object.fromEntries(localizationModule.exports.localeOptions.map(([locale]) => [locale, { ...localizationModule.exports.catalogs[locale], ...teachingTranslations[locale] }]));
const fail = (message) => { throw new Error(message); };

if (content.schemaVersion !== 1 || content.app !== "drum-hero") fail("Unsupported Drum Hero content schema.");
const expectedLocales = localizationModule.exports.localeOptions.map(([locale]) => locale);
const expectedKeys = [...localizationModule.exports.messageKeys, ...localizationModule.exports.phraseKeys, ...localizationModule.exports.lessonContentKeys, ...localizationModule.exports.lessonUiKeys, ...localizationModule.exports.dashboardToolKeys, ...localizationModule.exports.appMetadataKeys, ...Object.keys(teachingTranslations.en)];
if (!content.translations || expectedLocales.some((locale) => !content.translations[locale])) fail("Mobile localization catalogs are missing a supported language.");
for (const locale of expectedLocales) {
  const catalog = content.translations[locale];
  for (const key of expectedKeys) {
    if (typeof catalog[key] !== "string" || !catalog[key].trim()) fail(`Missing translation key ${key} for ${locale}.`);
    const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");
    if (placeholders(catalog[key]) !== placeholders(key)) fail(`Placeholder mismatch for ${locale}: ${key}.`);
  }
}
const lessonKeys = localizationModule.exports.lessonContentKeys;
for (const locale of expectedLocales) {
  if (locale !== "en" && localizationModule.exports.lessonContentRows[locale]?.length !== lessonKeys.length) fail(`Incomplete lesson content translations for ${locale}.`);
  if (localizationModule.exports.lessonUiRows[locale]?.length !== localizationModule.exports.lessonUiKeys.length) fail(`Incomplete lesson interface translations for ${locale}.`);
  const dashboardRow = localizationModule.exports.dashboardToolRowsByLocale[locale];
  if (!dashboardRow || dashboardRow.length !== localizationModule.exports.dashboardToolKeys.length || dashboardRow.some((value) => typeof value !== "string" || !value.trim())) fail(`Incomplete dashboard translations for ${locale}.`);
  if (locale !== "en" && dashboardRow.some((value, index) => index % 2 === 1 && value === localizationModule.exports.dashboardToolRowsByLocale.en[index])) fail(`Dashboard description is still English for ${locale}.`);
  if (!localizationModule.exports.appMetadataRows[locale] || (locale !== "en" && localizationModule.exports.appMetadataRows[locale] === localizationModule.exports.appMetadataRows.en)) fail(`App metadata is untranslated for ${locale}.`);
}
for (const locale of expectedLocales) {
  if (lessonKeys.some((key) => !content.translations[locale]?.[key]?.trim())) fail(`Missing built-in lesson translation for ${locale}.`);
}
for (const field of ["lessons", "rudiments", "grooves", "songs"]) {
  if (!Array.isArray(content[field])) fail(`${field} must be an array.`);
}
if (content.lessons.length !== 12 || content.rudiments.length !== 7 || content.grooves.length !== 100) {
  fail(`Unexpected catalogue counts: ${content.lessons.length} lessons, ${content.rudiments.length} rudiments, ${content.grooves.length} grooves.`);
}
if (content.songs.length !== 8) fail(`Expected 8 bundled song examples, found ${content.songs.length}.`);
const all = [...content.lessons, ...content.rudiments, ...content.grooves];
const ids = all.map(({ id }) => id);
if (new Set(ids).size !== ids.length) fail("Lesson and pattern identifiers must be unique.");
const patterns = [...content.rudiments, ...content.grooves];
for (const pattern of patterns) {
  const steps = pattern.beats * pattern.subdivision / 4;
  if (pattern.defaultBpm < 40 || pattern.defaultBpm > 200 || !pattern.hits.length) fail(`Invalid tempo or empty pattern: ${pattern.id}`);
  if (pattern.hits.some((hit) => !Number.isInteger(hit.step) || hit.step < 0 || hit.step >= steps || !["kick", "snare", "hihat", "tom", "crash"].includes(hit.instrument))) fail(`Invalid hit grid: ${pattern.id}`);
}
const songIDs = content.songs.map(({ id }) => id);
if (new Set(songIDs).size !== songIDs.length) fail("Song example identifiers must be unique.");
for (const song of content.songs) {
  if (!song.title || !song.artist || song.bpm < 40 || song.bpm > 200 || !Array.isArray(song.sections) || !song.sections.length) fail(`Invalid song example: ${song.id}`);
  for (const section of song.sections) {
    if (!Array.isArray(section.parts) || !section.parts.length) fail(`Song section ${song.id}/${section.id} has no playable parts.`);
    for (const part of section.parts) {
      const steps = part.beats * part.subdivision / 4;
      if (part.bpm < 40 || part.bpm > 200 || ![4, 8, 12, 16].includes(part.subdivision) || !part.hits.length || part.hits.some((hit) => !Number.isInteger(hit.step) || hit.step < 0 || hit.step >= steps || !["kick", "snare", "hihat", "tom", "crash"].includes(hit.instrument))) fail(`Invalid playable part in ${song.id}/${section.id}/${part.id}.`);
    }
  }
}
const expectedSongs = songLibraryModule.exports.examples.map((song) => ({
  id: song.id,
  title: song.title,
  artist: song.artist,
  difficulty: song.difficulty,
  bpm: song.bpm,
  meter: song.meter,
  tags: song.tags,
  notes: song.notes,
  sections: song.sections.map((section) => ({
    id: section.id,
    name: section.name,
    bpm: section.bpm,
    parts: section.parts.map((part) => ({
      id: part.id,
      name: part.name,
      bpm: part.bpm,
      beats: part.beats,
      subdivision: part.subdivision,
      meter: part.meter,
      hits: part.hits
        .filter((hit) => ["kick", "snare", "hihat", "tom", "crash"].includes(hit.instrument))
        .map(({ step, instrument, accent }) => ({ step, instrument, accent: accent === true })),
    })),
  })),
}));
if (JSON.stringify(content.songs) !== JSON.stringify(expectedSongs)) fail("Shared song examples are stale. Run npm run mobile:content:export.");
const songPatternIDs = content.songs.flatMap((song) => song.sections.flatMap((section) => section.parts.map((part) => `song.${song.id}.${section.id}.${part.id}`)));
const allContentIDs = [...ids, ...songPatternIDs];
if (new Set(allContentIDs).size !== allContentIDs.length) fail("Lesson, built-in pattern, and song practice identifiers must be unique.");
for (const lesson of content.lessons) {
  if (lesson.practicePatternId && !patterns.some((pattern) => pattern.id === lesson.practicePatternId)) fail(`Lesson ${lesson.id} refers to an unknown pattern.`);
  if (!content.lessonGuides[lesson.id]) fail(`Lesson ${lesson.id} has no guide.`);
}

const loadedModule = curriculumModule;
for (const field of ["lessons", "rudiments", "grooves"]) {
  if (JSON.stringify(content[field]) !== JSON.stringify(loadedModule.exports[field])) fail(`Shared ${field} is stale. Run npm run mobile:content:export.`);
}
if (JSON.stringify(content.lessonGuides) !== JSON.stringify(guideModule.exports.lessonGuides)) fail("Shared lesson guides are stale. Run npm run mobile:content:export.");
if (JSON.stringify(content.translations) !== JSON.stringify(expectedCatalogs)) fail("Shared localization catalogs are stale. Run npm run mobile:content:export.");
console.log("Drum Hero mobile content is current and valid.");
