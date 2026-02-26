export type ParsedMenu = {
  sopas: string[];
  carnes: string[];
  complementos: string[];
};

const SECTION_HEADERS = [
  { key: "sopas" as const, patterns: [/^sopas$/i] },
  { key: "carnes" as const, patterns: [/^carnes?$/i, /^carne$/i] },
  {
    key: "complementos" as const,
    patterns: [/^~?\s*complementos\s*~?$/i, /^complementos$/i],
  },
];

function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function isSectionHeader(line: string): { key: keyof ParsedMenu } | null {
  const normalized = normalizeLine(line).replace(/^[~\s]+|[~\s]+$/g, "").trim();
  if (!normalized) return null;
  for (const { key, patterns } of SECTION_HEADERS) {
    if (patterns.some((p) => p.test(normalized))) return { key };
  }
  return null;
}

function isDecorativeOrEmpty(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^MENÚ DE HOY$/i.test(t)) return true;
  if (/^⚡+$/.test(t)) return true;
  return false;
}

function capitalizeItem(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Parses the restaurant's daily menu message into sopas, carnes, and complementos.
 * Section headers are detected case-insensitively (e.g. "Sopas", "CARNES", "~COMPLEMENTOS ~").
 */
export function parseMenu(rawText: string): ParsedMenu {
  const result: ParsedMenu = {
    sopas: [],
    carnes: [],
    complementos: [],
  };

  let currentKey: keyof ParsedMenu | null = null;
  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (isDecorativeOrEmpty(trimmed)) continue;

    const header = isSectionHeader(trimmed);
    if (header) {
      currentKey = header.key;
      continue;
    }

    const item = capitalizeItem(normalizeLine(trimmed));
    if (!item) continue;

    if (currentKey) {
      result[currentKey].push(item);
    } else {
      result.complementos.push(item);
    }
  }

  result.sopas = dedupe(result.sopas);
  result.carnes = dedupe(result.carnes);
  result.complementos = dedupe(result.complementos);

  return result;
}
