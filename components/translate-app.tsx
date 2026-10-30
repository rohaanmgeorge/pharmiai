"use client";

import { useEffect } from "react";
import type { Lang } from "@/lib/i18n";

// Shows the whole app in Malayalam or Hindi.
// Screen text is written in English in the code; scripts/i18n-extract.mts collects it and
// lib/translations/{ml,hi}.json hold the reviewed translations. This component swaps each
// English text on screen (and placeholders / labels) for its translation, and keeps doing so as
// screens change. Switching back to English restores the original text.
//
// Not translated: anything inside [data-no-translate] (medicine facts from the database, chat
// replies that are already in the right language), form inputs, and text with no translation.

type Dict = { exact: Map<string, string>; patterns: { re: RegExp; to: string }[] };

const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG"]);

const cache = new Map<Lang, Promise<Dict>>();

function loadDict(lang: Lang): Promise<Dict> {
  if (!cache.has(lang)) {
    const file = lang === "ml" ? import("@/lib/translations/ml.json") : import("@/lib/translations/hi.json");
    cache.set(
      lang,
      file.then((m) => {
        const entries = Object.entries(m.default as Record<string, string>);
        const exact = new Map(entries.filter(([k]) => !k.includes("{}")));
        // "Time for {}" → /^Time for (.+?)$/ ; the translation gets the same values in order.
        const patterns = entries
          .filter(([k]) => k.includes("{}"))
          .map(([k, to]) => ({ re: new RegExp(`^${k.split("{}").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.+?)")}$`), to }))
          .sort((a, b) => b.re.source.length - a.re.source.length); // most specific first
        return { exact, patterns };
      }),
    );
  }
  return cache.get(lang)!;
}

function translate(text: string, dict: Dict): string | null {
  const core = text.trim();
  if (!core || !/[A-Za-z]/.test(core)) return null;
  const lead = text.slice(0, text.indexOf(core));
  const tail = text.slice(text.indexOf(core) + core.length);
  const norm = core.replace(/\s+/g, " ");
  const hit = dict.exact.get(norm);
  if (hit) return lead + hit + tail;
  for (const p of dict.patterns) {
    const m = norm.match(p.re);
    if (m) {
      let i = 1;
      return lead + p.to.replace(/\{\}/g, () => m[i++] ?? "") + tail;
    }
  }
  return null;
}

const skip = (el: Element | null) => !el || SKIP_TAGS.has(el.tagName) || el.closest("[data-no-translate], [contenteditable=true]") !== null;

export function TranslateApp({ lang }: { lang: Lang }) {
  useEffect(() => {
    // English originals, so we can translate again after React changes a text, or switch back.
    const originalText = new Map<Text, string>();
    const originalAttr = new Map<Element, Partial<Record<(typeof ATTRS)[number], string>>>();
    const written = new WeakMap<Node, string>(); // what WE last wrote (to ignore our own changes)
    let dict: Dict | null = null;
    let stopped = false;

    const doText = (node: Text) => {
      if (skip(node.parentElement)) return;
      const current = node.nodeValue ?? "";
      if (written.get(node) === current) return; // our own translation, nothing new
      originalText.set(node, current); // React (or the page) wrote new English
      if (!dict) return;
      const t = translate(current, dict);
      if (t !== null && t !== current) {
        written.set(node, t);
        node.nodeValue = t;
      }
    };

    const doAttrs = (el: Element) => {
      if (skip(el.parentElement) && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
      if (el.closest("[data-no-translate]")) return;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v === null) continue;
        const saved = originalAttr.get(el) ?? {};
        if (saved[a] !== undefined && written.get(el) === `${a}:${v}`) continue;
        saved[a] = v;
        originalAttr.set(el, saved);
        const t = dict && translate(v, dict);
        if (t && t !== v) {
          written.set(el, `${a}:${t}`);
          el.setAttribute(a, t);
        }
      }
    };

    const doTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const el = root as Element;
      if (SKIP_TAGS.has(el.tagName) && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
      doAttrs(el);
      el.querySelectorAll("[placeholder], [aria-label], [title], [alt]").forEach(doAttrs);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) doText(n as Text);
    };

    const observer = new MutationObserver((records) => {
      if (!dict) return;
      for (const r of records) {
        if (r.type === "characterData") doText(r.target as Text);
        else if (r.type === "attributes") doAttrs(r.target as Element);
        else r.addedNodes.forEach(doTree);
      }
    });

    if (lang === "en") return; // English is what the code already shows

    loadDict(lang).then((d) => {
      if (stopped) return;
      dict = d;
      doTree(document.body);
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    });

    return () => {
      // Leaving this language: put the English back, so the next language starts clean.
      stopped = true;
      observer.disconnect();
      originalText.forEach((text, node) => {
        if (node.isConnected && written.get(node) === node.nodeValue) node.nodeValue = text;
      });
      originalAttr.forEach((attrs, el) => {
        if (!el.isConnected) return;
        for (const [a, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(a, v);
      });
    };
  }, [lang]);

  return null;
}
