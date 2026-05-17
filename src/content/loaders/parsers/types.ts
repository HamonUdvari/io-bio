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
  knownAs?: string;
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

export type ExtractedBio = {
  firstName: string | null;
  lastName: string | null;
  knownAs?: string;
  summary: string | null;
  life: string | null;
  roles: Role[];
  imageSource: string | null;
  imageAttachment: ImageAttachment | null;
  version: string | null;
  authors: string | null;
  organisation: string | null;
  role: string | null;
  nationality: string | null;
  country: string | null;
  startYear: number | null;
  endYear: number | null;
  archives: string;
  publications: string;
  literature: string;
  body: string;
  html: string;
};
