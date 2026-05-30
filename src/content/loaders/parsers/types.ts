export type Severity = "info" | "warn" | "error";

export type Warning = {
  code: string;
  field: string;
  message: string;
  severity: Severity;
};

export type ParserResult<T> = {
  value: T;
  warnings: Warning[];
};

export type Role = {
  ordinalText?: string;
  title: string;
  organisation?: string;
  abbreviation?: string;
  startYear?: number;
  endYear?: number;
};

export type IntroFields = {
  firstName: string | null;
  lastName: string | null;
  knownAs?: string; // "known as" nickname (shown bare)
  nee?: string; // "née" maiden name (shown as "née …")
  summary: string | null;
  life: string | null;
};

export type ImageAttachment = {
  base64: string;
  name: string;
  extension: string;
  mimeType?: string;
};

export type APLSections = {
  archives: string;
  publications: string;
  literature: string;
};

export type Citation = {
  raw: string;
};

export type APLSectionData = {
  items: Citation[];
  /** Optional "all websites accessed DD month YYYY" footer text. */
  websitesAccessedOn?: string;
};

export type ExtractedBio = {
  firstName: string | null;
  lastName: string | null;
  knownAs?: string; // "known as" nickname (shown bare)
  nee?: string; // "née" maiden name (shown as "née …")
  summary: string | null;
  life: string | null;
  roles: Role[];
  nationality: string | null;
  country: string | null;
  imageSource: string | null;
  imageAttachment: ImageAttachment | null;
  version: string | null;
  authors: string | null;
  archives: APLSectionData;
  publications: APLSectionData;
  literature: APLSectionData;
  body: string;
  html: string;
};
