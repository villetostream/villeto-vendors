export type UploadProfileName = "document" | "evidenceImage" | "evidenceAttachment";

interface UploadProfile {
  maxBytes: number;
  maxMbLabel: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
  label: string;
}

const UPLOAD_PROFILES: Record<UploadProfileName, UploadProfile> = {
  document: {
    maxBytes: 10 * 1024 * 1024,
    maxMbLabel: "10MB",
    extensions: [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"],
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    label: "PDF, DOC, DOCX, JPG, or PNG",
  },
  evidenceImage: {
    maxBytes: 5 * 1024 * 1024,
    maxMbLabel: "5MB",
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    label: "JPEG, PNG, or WebP",
  },
  evidenceAttachment: {
    maxBytes: 10 * 1024 * 1024,
    maxMbLabel: "10MB",
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".pdf"],
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    label: "PDF, JPEG, PNG, or WebP",
  },
};

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
  detectedKind?: "pdf" | "jpeg" | "png" | "webp" | "doc" | "docx";
}

function getFileExtension(filename: string): string {
  const clean = filename.trim();
  const idx = clean.lastIndexOf(".");
  if (idx <= 0 || idx === clean.length - 1) return "";
  return clean.slice(idx).toLowerCase();
}

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

function looksLikeActiveMarkup(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 128))
    .trimStart()
    .toLowerCase();
  return (
    head.startsWith("<svg") ||
    head.startsWith("<?xml") ||
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<script")
  );
}

/**
 * Inspects file magic bytes against expected document/image signatures.
 */
export function detectMagicKind(
  bytes: Uint8Array
): "pdf" | "jpeg" | "png" | "webp" | "doc" | "docx" | null {
  if (looksLikeActiveMarkup(bytes)) {
    return null;
  }

  // %PDF-
  if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "pdf";
  }
  // JPEG SOI marker
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  // PNG signature
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  // Legacy MS Word OLE2 compound document
  if (startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return "doc";
  }
  // OOXML (.docx ZIP container PK\x03\x04)
  if (startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return "docx";
  }

  return null;
}

const EXTENSION_TO_MAGIC: Record<string, UploadValidationResult["detectedKind"]> = {
  ".pdf": "pdf",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".webp": "webp",
  ".doc": "doc",
  ".docx": "docx",
};

/**
 * Validates file size, filename, extension, and declared MIME type synchronously.
 */
export function validateUploadMetadata(
  file: Pick<File, "name" | "size" | "type">,
  profileName: UploadProfileName
): UploadValidationResult {
  const profile = UPLOAD_PROFILES[profileName];

  if (!file.name || file.name.includes("\0") || file.name.length > 255) {
    return { valid: false, error: "Invalid file name." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "Selected file is empty." };
  }

  if (file.size > profile.maxBytes) {
    return { valid: false, error: `File must be under ${profile.maxMbLabel}.` };
  }

  const ext = getFileExtension(file.name);
  if (!profile.extensions.includes(ext)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed formats: ${profile.label}.`,
    };
  }

  // Require matching MIME type when provided by the browser (some OSes leave .doc/.docx type blank)
  if (file.type && !profile.mimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid MIME type. Allowed formats: ${profile.label}.`,
    };
  }

  return { valid: true };
}

/**
 * Full client-side upload check combining metadata constraints and magic-byte inspection.
 */
export async function validateUploadFile(
  file: File,
  profileName: UploadProfileName
): Promise<UploadValidationResult> {
  const metaCheck = validateUploadMetadata(file, profileName);
  if (!metaCheck.valid) {
    return metaCheck;
  }

  const ext = getFileExtension(file.name);
  const expectedKind = EXTENSION_TO_MAGIC[ext];

  const headerSlice = file.slice(0, 128);
  const buffer = await headerSlice.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const detected = detectMagicKind(bytes);

  if (!detected || (expectedKind && detected !== expectedKind)) {
    return {
      valid: false,
      error: "File contents do not match the declared file format.",
    };
  }

  return { valid: true, detectedKind: detected };
}
