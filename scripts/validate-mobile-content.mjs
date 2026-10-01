import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const contentPath = path.join(root, "shared/mobile/v1/drum-content.json");
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
const fail = (message) => { throw new Error(message); };

if (content.schemaVersion !== 1 || content.app !== "drum-hero") fail("Unsupported Drum Hero content schema.");
for (const field of ["lessons", "rudiments", "grooves"]) {
  if (!Array.isArray(content[field])) fail(`${field} must be an array.`);
}
if (content.lessons.length !== 12 || content.rudiments.length !== 7 || content.grooves.length !== 100) {
  fail(`Unexpected catalogue counts: ${content.lessons.length} lessons, ${content.rudiments.length} rudiments, ${content.grooves.length} grooves.`);
}
const all = [...content.lessons, ...content.rudiments, ...content.grooves];
const ids = all.map(({ id }) => id);
if (new Set(ids).size !== ids.length) fail("Lesson and pattern identifiers must be unique.");
const patterns = [...content.rudiments, ...content.grooves];
for (const pattern of patterns) {
  const steps = pattern.beats * pattern.subdivision / 4;
  if (pattern.defaultBpm < 40 || pattern.defaultBpm > 200 || !pattern.hits.length) fail(`Invalid tempo or empty pattern: ${pattern.id}`);
  if (pattern.hits.some((hit) => !Number.isInteger(hit.step) || hit.step < 0 || hit.step >= steps || !["kick", "snare", "hihat", "tom", "crash"].includes(hit.instrument))) fail(`Invalid hit grid: ${pattern.id}`);
}
for (const lesson of content.lessons) {
  if (lesson.practicePatternId && !patterns.some((pattern) => pattern.id === lesson.practicePatternId)) fail(`Lesson ${lesson.id} refers to an unknown pattern.`);
  if (!content.lessonGuides[lesson.id]) fail(`Lesson ${lesson.id} has no guide.`);
}

const source = fs.readFileSync(path.join(root, "lib/curriculum.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loadedModule = { exports: {} };
vm.runInNewContext(output, { module: loadedModule, exports: loadedModule.exports }, { filename: "lib/curriculum.ts" });
for (const field of ["lessons", "rudiments", "grooves"]) {
  if (JSON.stringify(content[field]) !== JSON.stringify(loadedModule.exports[field])) fail(`Shared ${field} is stale. Run npm run mobile:content:export.`);
}
const guideSource = fs.readFileSync(path.join(root, "lib/lesson-guides.ts"), "utf8");
const guideOutput = ts.transpileModule(guideSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const guideModule = { exports: {} };
vm.runInNewContext(guideOutput, { module: guideModule, exports: guideModule.exports }, { filename: "lib/lesson-guides.ts" });
if (JSON.stringify(content.lessonGuides) !== JSON.stringify(guideModule.exports.lessonGuides)) fail("Shared lesson guides are stale. Run npm run mobile:content:export.");
console.log("Drum Hero mobile content is current and valid.");
