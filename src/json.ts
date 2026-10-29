// SPDX-License-Identifier: Apache-2.0

/**
 * Parses a GeoCourse file and checks the I-JSON constraints of spec 2
 * (Encoding) that JSON.parse does not: no byte-order mark, no duplicate member
 * names, integers within ±2^53. Returns the parsed value or a list of
 * problems.
 */
export function parseIJson(text: string): { value?: unknown; problems: string[] } {
  const problems: string[] = [];
  if (text.charCodeAt(0) === 0xfeff) {
    problems.push("file starts with a byte-order mark");
    text = text.slice(1);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { problems: [...problems, `not valid JSON: ${(e as Error).message}`] };
  }
  findDuplicateMembers(text, problems);
  findUnsafeIntegers(value, "", problems);
  return { value, problems };
}

/** Scans already-valid JSON text for repeated member names in any object. */
function findDuplicateMembers(text: string, problems: string[]): void {
  // One entry per open container: a Set of names for objects, null for arrays.
  const stack: (Set<string> | null)[] = [];
  let expectKey = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      stack.push(new Set());
      expectKey = true;
    } else if (c === "[") {
      stack.push(null);
      expectKey = false;
    } else if (c === "}" || c === "]") {
      stack.pop();
      expectKey = false;
    } else if (c === ",") {
      expectKey = stack[stack.length - 1] instanceof Set;
    } else if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (expectKey) {
        const name = JSON.parse(text.slice(i, j + 1)) as string;
        const names = stack[stack.length - 1] as Set<string>;
        if (names.has(name)) problems.push(`duplicate member name "${name}"`);
        names.add(name);
        expectKey = false;
      }
      i = j;
    }
  }
}

function findUnsafeIntegers(v: unknown, path: string, problems: string[]): void {
  if (typeof v === "number") {
    if (Number.isInteger(v) && !Number.isSafeInteger(v)) problems.push(`${path || "/"}: integer outside ±2^53`);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => findUnsafeIntegers(x, `${path}/${i}`, problems));
  } else if (v !== null && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) findUnsafeIntegers(x, `${path}/${k}`, problems);
  }
}
