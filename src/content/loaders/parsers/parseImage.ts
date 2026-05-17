import type { ImageAttachment, ParserResult, Warning } from "./types";

export type ImageFields = {
  imageSource: string | null;
  attachment: ImageAttachment | null;
  /** Indices in ast.content that this parser consumed (the "Source:" line). */
  consumed: number[];
};

const SOURCE_RE = /Source:\s*(.+)/i;

export function parseImage(ast: any): ParserResult<ImageFields> {
  const warnings: Warning[] = [];
  const value: ImageFields = {
    imageSource: null,
    attachment: null,
    consumed: [],
  };

  const content: any[] = ast?.content || [];

  const sourceIndex = content.findIndex(
    (c) => c?.type === "paragraph" && c.text?.startsWith("Source:"),
  );
  if (sourceIndex >= 0) {
    const node = content[sourceIndex];
    const match = node.text?.match(SOURCE_RE);
    if (match) {
      value.imageSource = match[1].trim();
      value.consumed.push(sourceIndex);
    }
  } else {
    warnings.push({
      code: "image_source_missing",
      field: "imageSource",
      message: "No 'Source:' paragraph found",
      severity: "warn",
    });
  }

  const attachments = ast?.attachments;
  if (Array.isArray(attachments) && attachments.length > 0) {
    const a = attachments[0];
    if (a?.data && a?.name) {
      value.attachment = {
        base64: a.data,
        name: a.name,
        extension:
          a.extension || (a.name.includes(".") ? a.name.split(".").pop() : ""),
        mimeType: a.mimeType,
      };
    }
  } else {
    warnings.push({
      code: "image_attachment_missing",
      field: "imageAttachment",
      message: "No image attachment found in document",
      severity: "warn",
    });
  }

  return { value, warnings };
}
