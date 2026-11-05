import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const sourceRoots = ["app", "components"];
const localesDirectory = path.join(root, "lib/catalogs");
const localeFiles = fs.readdirSync(localesDirectory).filter((file) => file.endsWith(".ts")).sort();

function loadTypeScriptModule(filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports }, { filename });
  return module.exports;
}

const translateAppCopy = loadTypeScriptModule(path.join(root, "lib/app-copy.ts")).translateAppCopy;
const catalogs = Object.fromEntries(localeFiles.map((file) => {
  const locale = file.slice(0, -3);
  return [locale, loadTypeScriptModule(path.join(localesDirectory, file)).default];
}));

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(filename) : /\.(?:ts|tsx)$/.test(entry.name) ? [filename] : [];
  });
}

function literalText(node) {
  return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

const keys = new Map();
let dynamicCalls = 0;
let scannedFiles = 0;
for (const directory of sourceRoots) {
  for (const filename of sourceFiles(path.join(root, directory))) {
    scannedFiles += 1;
    const source = fs.readFileSync(filename, "utf8");
    const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
        const key = node.arguments[0] ? literalText(node.arguments[0]) : null;
        if (key) keys.set(key, (keys.get(key) ?? 0) + 1);
        else dynamicCalls += 1;
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && node.tagName.text === "LocalizedText") {
        const textAttribute = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === "text");
        const key = textAttribute && ts.isJsxAttribute(textAttribute) && textAttribute.initializer && ts.isStringLiteralLike(textAttribute.initializer)
          ? textAttribute.initializer.text
          : null;
        if (key) keys.set(key, (keys.get(key) ?? 0) + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
}

const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join("|");
const report = {
  format: "drum-hero-ui-localization-audit-v1",
  scannedFiles,
  literalKeys: keys.size,
  dynamicCallsSkipped: dynamicCalls,
  locales: {}
};

for (const locale of Object.keys(catalogs).filter((item) => item !== "en")) {
  const untranslated = [];
  const placeholderMismatches = [];
  for (const [key, occurrences] of keys) {
    const catalogValue = catalogs[locale]?.[key];
    const value = catalogValue && catalogValue !== key ? catalogValue : translateAppCopy(locale, key);
    if (!value || value === key) untranslated.push({ key, occurrences });
    else if (placeholders(key) !== placeholders(value)) placeholderMismatches.push({ key, occurrences });
  }
  report.locales[locale] = {
    translated: keys.size - untranslated.length - placeholderMismatches.length,
    untranslatedOrSourceEqual: untranslated.length,
    placeholderMismatches: placeholderMismatches.length,
    untranslated,
    mismatches: placeholderMismatches
  };
}

const args = new Set(process.argv.slice(2));
if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Scanned ${report.scannedFiles} app/component files, ${report.literalKeys} literal UI strings, and skipped ${report.dynamicCallsSkipped} dynamic translation calls.`);
  for (const [locale, result] of Object.entries(report.locales)) {
    console.log(`${locale}: ${result.translated}/${report.literalKeys} translated · ${result.untranslatedOrSourceEqual} source-equal or missing · ${result.placeholderMismatches} placeholder mismatches`);
    if (args.has("--details")) {
      for (const item of result.untranslated.slice(0, 20)) console.log(`  fallback: ${item.key}${item.occurrences > 1 ? ` (${item.occurrences} uses)` : ""}`);
      for (const item of result.mismatches) console.log(`  placeholder mismatch: ${item.key}`);
      if (result.untranslated.length > 20) console.log(`  …and ${result.untranslated.length - 20} more fallback strings`);
    }
  }
  console.log("Source-equal strings may be proper names; this report checks catalog coverage, not translation quality or accessibility sign-off.");
}

if (args.has("--strict") && Object.values(report.locales).some((locale) => locale.untranslated.length || locale.mismatches.length)) process.exitCode = 1;
