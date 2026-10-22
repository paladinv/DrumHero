import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = process.cwd();
const destination = path.join(root, "shared/mobile/v1/drum-content.json");
const cache = new Map();

function loadModule(relativePath) {
  if (cache.has(relativePath)) return cache.get(relativePath);
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  cache.set(relativePath, loadedModule.exports);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require(specifier);
    const base = path.normalize(path.join(path.dirname(relativePath), specifier));
    return loadModule(base.endsWith(".ts") ? base : `${base}.ts`);
  };
  vm.runInNewContext(output, { module: loadedModule, exports: loadedModule.exports, require: localRequire }, { filename });
  return loadedModule.exports;
}

const curriculum = loadModule("lib/curriculum.ts");
const guides = loadModule("lib/lesson-guides.ts");
const songLibrary = loadModule("lib/song-library.ts");
const localization = loadModule("lib/locales.ts");
const teachingContent = loadModule("lib/teaching-content-locales.ts");
const translations = JSON.parse(JSON.stringify(localization.catalogs));
for (const [locale, entries] of Object.entries(teachingContent.teachingTranslations)) {
  Object.assign(translations[locale] ??= {}, entries);
}
const content = {
  schemaVersion: 1,
  app: "drum-hero",
  translations,
  lessons: curriculum.lessons,
  lessonGuides: guides.lessonGuides,
  rudiments: curriculum.rudiments,
  grooves: curriculum.grooves,
  songs: songLibrary.examples.map((song) => ({
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
  })),
};

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(content, null, 2)}\n`);
console.log(`Exported ${content.lessons.length} lessons, ${content.rudiments.length} rudiments, ${content.grooves.length} grooves, ${content.songs.length} song examples, and ${Object.keys(content.translations).length} language catalogs to ${path.relative(root, destination)}`);
