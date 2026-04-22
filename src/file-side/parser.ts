import Parser from "web-tree-sitter";
import { grammarWasmPath, type LanguageId } from "./language-registry.js";

export type Tree = Parser.Tree;
export type SyntaxNode = Parser.SyntaxNode;

let parserInitPromise: Promise<void> | null = null;
const langCache = new Map<LanguageId, Parser.Language>();
const parserCache = new Map<LanguageId, Parser>();

async function ensureParserInit(): Promise<void> {
  if (!parserInitPromise) {
    parserInitPromise = Parser.init();
  }
  await parserInitPromise;
}

export async function getLanguage(lang: LanguageId): Promise<Parser.Language> {
  await ensureParserInit();
  const cached = langCache.get(lang);
  if (cached) return cached;
  const loaded = await Parser.Language.load(grammarWasmPath(lang));
  langCache.set(lang, loaded);
  return loaded;
}

export async function getParser(lang: LanguageId): Promise<Parser> {
  const cached = parserCache.get(lang);
  if (cached) return cached;
  const language = await getLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(language);
  parserCache.set(lang, parser);
  return parser;
}

export async function parseSource(lang: LanguageId, source: string): Promise<Tree> {
  const parser = await getParser(lang);
  const tree = parser.parse(source);
  if (!tree) throw new Error(`tree-sitter returned null for ${lang}`);
  return tree;
}
