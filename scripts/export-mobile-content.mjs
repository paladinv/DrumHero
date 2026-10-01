import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const destination = path.join(root, "shared/mobile/v1/drum-content.json");

function loadModule(relativePath) {
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
  vm.runInNewContext(output, { module: loadedModule, exports: loadedModule.exports }, { filename });
  return JSON.parse(JSON.stringify(loadedModule.exports));
}

const curriculum = loadModule("lib/curriculum.ts");
const guides = loadModule("lib/lesson-guides.ts");
const content = {
  schemaVersion: 1,
  app: "drum-hero",
  lessons: curriculum.lessons,
  lessonGuides: guides.lessonGuides,
  rudiments: curriculum.rudiments,
  grooves: curriculum.grooves,
};

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(content, null, 2)}\n`);
console.log(`Exported ${content.lessons.length} lessons, ${content.rudiments.length} rudiments, and ${content.grooves.length} grooves to ${path.relative(root, destination)}`);
