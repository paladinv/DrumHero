import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const filename = path.join(root, "lib/locales.ts");
const source = fs.readFileSync(filename, "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const teachingFilename = path.join(root, "lib/teaching-locales.ts");
const teachingOutput = ts.transpileModule(fs.readFileSync(teachingFilename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const teachingModule = { exports: {} };
vm.runInNewContext(teachingOutput, { module: teachingModule, exports: teachingModule.exports }, { filename: teachingFilename });
const dashboardFilename = path.join(root, "lib/dashboard-locales.ts");
const dashboardOutput = ts.transpileModule(fs.readFileSync(dashboardFilename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const dashboardModule = { exports: {} };
vm.runInNewContext(dashboardOutput, { module: dashboardModule, exports: dashboardModule.exports }, { filename: dashboardFilename });
const loaded = { exports: {} };
vm.runInNewContext(output, { module: loaded, exports: loaded.exports, require: (specifier) => specifier.includes("dashboard-locales") ? dashboardModule.exports : teachingModule.exports }, { filename });
const { localeOptions, messageKeys, phraseKeys, lessonUiKeys, dashboardToolKeys, appMetadataKeys, catalogs } = loaded.exports;
const curriculumFilename = path.join(root, "lib/curriculum.ts");
const curriculumOutput = ts.transpileModule(fs.readFileSync(curriculumFilename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const curriculumModule = { exports: {} };
vm.runInNewContext(curriculumOutput, { module: curriculumModule, exports: curriculumModule.exports }, { filename: curriculumFilename });
const guidesFilename = path.join(root, "lib/lesson-guides.ts");
const guidesOutput = ts.transpileModule(fs.readFileSync(guidesFilename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const guidesModule = { exports: {} };
vm.runInNewContext(guidesOutput, { module: guidesModule, exports: guidesModule.exports }, { filename: guidesFilename });
const patternDisplayFilename = path.join(root, "lib/teaching-pattern-display.ts");
const patternDisplayOutput = ts.transpileModule(fs.readFileSync(patternDisplayFilename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const patternDisplayModule = { exports: {} };
vm.runInNewContext(patternDisplayOutput, { module: patternDisplayModule, exports: patternDisplayModule.exports, require: () => curriculumModule.exports }, { filename: patternDisplayFilename });
const contentFilename = path.join(root, "lib/teaching-content-locales.ts");
const contentOutput = ts.transpileModule(fs.readFileSync(contentFilename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const contentModule = { exports: {} };
vm.runInNewContext(contentOutput, { module: contentModule, exports: contentModule.exports, require: (specifier) => specifier.includes("curriculum") ? curriculumModule.exports : specifier.includes("lesson-guides") ? guidesModule.exports : specifier.includes("teaching-pattern-display") ? patternDisplayModule.exports : loaded.exports }, { filename: contentFilename });
const teachingRows = contentModule.exports.teachingContentTranslations();
for (const [locale] of localeOptions) Object.assign(catalogs[locale], teachingRows[locale]);
const teachingContentKeys = Object.keys(teachingRows.en);
const allMessageKeys = [...messageKeys, ...phraseKeys, ...lessonUiKeys, ...dashboardToolKeys, ...appMetadataKeys, ...teachingContentKeys];
const strings = {};
for (const key of allMessageKeys) {
  const localizations = {};
  for (const [locale] of localeOptions) {
    const value = catalogs[locale][key];
    if (value !== key) localizations[locale] = { stringUnit: { state: "translated", value } };
  }
  strings[key] = { localizations };
}
const destination = path.join(root, "ios/DrumHero/Sources/Resources/Localizable.xcstrings");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify({ sourceLanguage: "en", strings, version: "1.0" }, null, 2)}\n`);

const catalogDirectory = path.join(root, "lib/catalogs");
fs.mkdirSync(catalogDirectory, { recursive: true });
for (const [locale] of localeOptions) {
  fs.writeFileSync(path.join(catalogDirectory, `${locale}.ts`), `const catalog = ${JSON.stringify(catalogs[locale], null, 2)} as const;\nexport default catalog;\n`);
}
const loaderCases = localeOptions.map(([locale]) => `    case ${JSON.stringify(locale)}: return (await import(${JSON.stringify(`./catalogs/${locale}`)})).default;`).join("\n");
fs.writeFileSync(path.join(root, "lib/catalog-loader.ts"), `import type { Catalog, Locale } from "./locale-core";\n\nexport async function loadCatalog(locale: Locale): Promise<Catalog> {\n  switch (locale) {\n${loaderCases}\n  }\n}\n`);
console.log(`Exported ${allMessageKeys.length} strings for ${localeOptions.length} languages to ${path.relative(root, destination)}`);
