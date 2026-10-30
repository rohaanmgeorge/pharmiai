// Collects every piece of English text shown on screen, so it can be translated once.
// Reads app/, components/ and lib/ with the TypeScript compiler (no guessing from regexes).
// Output: lib/translations/ui-strings.json — a sorted list. Text with a variable inside, like
// `Time for ${name}`, becomes a pattern "Time for {}".
// Usage: npm run i18n:extract
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ROOTS = ["app", "components", "lib"];
const SKIP_FILES = /(\/lib\/mock\.ts|\/lib\/i18n|\.test\.ts|\/lib\/server\/messages\.ts|\/lib\/agent\/run\.ts|\/lib\/ai\/)/;
// Attributes that hold visible or spoken text; every other attribute (className, href…) is code.
const TEXT_ATTRS = new Set(["placeholder", "aria-label", "title", "alt", "label", "description", "body", "subtitle", "sub"]);
const CODE_ATTRS = new Set(["className", "href", "src", "key", "id", "type", "name", "role", "rel", "target", "method", "accept", "inputMode", "autoComplete", "layoutId", "variant", "size", "tone", "kind", "lang", "dir", "htmlFor", "mode", "fill", "stroke", "d", "viewBox", "xmlns", "transform", "strokeLinecap", "strokeLinejoin"]);
// Object keys whose string values are code, not text.
const CODE_KEYS = new Set(["className", "cls", "href", "url", "path", "key", "id", "code", "kind", "status", "state", "role", "type", "icon", "color", "lang", "speech", "action", "ml", "hi", "event", "reason", "dot", "mimeType", "model", "engine", "channel"]);

const out = new Set<string>();

const looksLikeText = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < 2 || !/[A-Za-z]{2,}/.test(t)) return false;
  if (/[ഀ-ൿऀ-ॿ]/.test(t)) return false; // already Malayalam / Hindi
  if (/^(\/|https?:|mailto:|tel:|sms:|data:|#|\.\/|@\/)/.test(t)) return false; // links and paths
  if (/^[a-z0-9_.:\-/[\]()%]+$/.test(t)) return false; // identifiers, css classes, codes ("taken", "bg-ok")
  if (/^[a-z-]+(\s+[a-z0-9:[\]/().%-]+-[a-z0-9:[\]/().%-]+)+/.test(t)) return false; // tailwind class lists
  if (/^(SELECT|select |insert |update |delete )/.test(t)) return false;
  if (/\b(rounded|px|py|min-h|max-w|bg|flex|grid|gap|border|shadow|size|font|leading|tracking)-/.test(t)) return false; // css classes
  if (/^&\w+;$/.test(t) || /^[a-z]+[A-Z]\w*$/.test(t)) return false; // html entities, camelCase names
  if (/\b(=>|function|const |import )/.test(t)) return false;
  return true;
};

// JSX writes quotes as &ldquo; etc.; the screen shows the real characters, so store those.
const ENTITIES: Record<string, string> = { "&ldquo;": "“", "&rdquo;": "”", "&lsquo;": "‘", "&rsquo;": "’", "&apos;": "'", "&quot;": '"', "&amp;": "&", "&nbsp;": " ", "&middot;": "·", "&mdash;": "—" };
const decode = (s: string) => s.replace(/&[a-z]+;/g, (e) => ENTITIES[e] ?? e);

function add(s: string) {
  const t = decode(s).replace(/\s+/g, " ").trim();
  if (looksLikeText(t)) out.add(t);
}

function visit(node: ts.Node, file: ts.SourceFile) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
  if (ts.isJsxText(node)) add(node.text);
  else if (ts.isJsxAttribute(node)) {
    const name = node.name.getText(file);
    if (CODE_ATTRS.has(name) || name.startsWith("on") || name.startsWith("data-")) return;
    if (node.initializer && ts.isStringLiteral(node.initializer) && (TEXT_ATTRS.has(name) || looksLikeText(node.initializer.text))) add(node.initializer.text);
  } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const p = node.parent;
    if (ts.isPropertyAssignment(p) && p.initializer === node && CODE_KEYS.has(p.name.getText(file).replace(/["']/g, ""))) return;
    if (ts.isCallExpression(p) && /\b(from|select|eq|in|rpc|order|neq|is|not|contains|overlaps|insert|update|upsert|delete|get|append|has|startsWith|includes|split|replace|match|test|querySelector|getElementById|createElement|addEventListener|removeEventListener|getItem|setItem|t|translate|msg|phrase)$/.test(p.expression.getText(file))) return;
    if (ts.isElementAccessExpression(p) || ts.isLiteralTypeNode(p) || ts.isCaseClause(p)) return;
    if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText(file))) return;
    if (looksLikeText(node.text) && /[A-Z]|\s/.test(node.text)) add(node.text);
  } else if (ts.isTemplateExpression(node)) {
    const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
    if (parts.join("").replace(/[^A-Za-z]/g, "").length >= 3) {
      const pattern = parts.join("{}").replace(/\s+/g, " ").trim();
      if (looksLikeText(pattern.replace(/\{\}/g, "")) && !/^\{\}$/.test(pattern)) out.add(pattern);
      // Static pieces also appear alone when React splits text around a variable.
      parts.forEach(add);
    }
    node.templateSpans.forEach((s) => visit(s.expression, file));
    return;
  }
  ts.forEachChild(node, (c) => visit(c, file));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

for (const file of ROOTS.flatMap(walk)) {
  if (SKIP_FILES.test("/" + file)) continue;
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  visit(src, src);
}

mkdirSync("lib/translations", { recursive: true });
const list = [...out].sort();
writeFileSync("lib/translations/ui-strings.json", JSON.stringify(list, null, 1) + "\n");
console.log(`${list.length} UI strings (${list.filter((s) => s.includes("{}")).length} with a variable) → lib/translations/ui-strings.json`);
