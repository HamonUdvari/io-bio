import type { ParserResult, Warning } from "./types";

export function parseVersion(content: any[]): ParserResult<{
  version: string | null;
  consumed: number[];
}> {
  const warnings: Warning[] = [];
  const idx = content.findIndex(
    (c) => c?.type === "paragraph" && c.text?.startsWith("Version"),
  );
  if (idx < 0) {
    warnings.push({
      code: "version_missing",
      field: "version",
      message: "No paragraph starting with 'Version' found",
      severity: "warn",
    });
    return { value: { version: null, consumed: [] }, warnings };
  }
  return { value: { version: content[idx].text, consumed: [idx] }, warnings };
}
