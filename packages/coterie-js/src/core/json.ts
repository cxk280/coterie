/** Parse JSON that an LLM may have wrapped in a ```json fence or padded with
 *  prose ("Here's the result: [...]"). Coordination nodes call this instead of a
 *  bare JSON.parse so a well-formed answer in a fence/prose wrapper isn't
 *  misread as a parse failure. Returns undefined when no JSON value is found. */
export function parseJsonLoose(raw: string): any {
  if (!raw) return undefined;
  let s = raw.trim();

  const fence = s.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  if (fence?.[1] !== undefined) s = fence[1].trim();

  try {
    return JSON.parse(s);
  } catch {
    // Fall back to extracting the first balanced-looking object/array span.
  }
  const start = s.search(/[[{]/);
  if (start === -1) return undefined;
  const close = s[start] === "{" ? "}" : "]";
  const end = s.lastIndexOf(close);
  if (end <= start) return undefined;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
