import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import type { Note } from "../shared/types";
import { IMAGE_FORMATS, type ImageMimeType } from "./media-validation";

type ArchiveNote = Omit<Note, "id"> & { id: string };
type ArchiveAsset = { id: string; mimeType: ImageMimeType; data: string };

export type ArchiveDocument = {
  format: "local-notes-archive";
  version: 1;
  exportedAt: string;
  notes: ArchiveNote[];
  assets: ArchiveAsset[];
};

const ARCHIVE_SCRYPT_COST = 16_384;
const ARCHIVE_SCRYPT_BLOCK_SIZE = 8;
const ARCHIVE_SCRYPT_PARALLELIZATION = 1;
const ARCHIVE_ID_PATTERN = /^[a-z0-9-]{36}$/i;

function deriveArchiveKey(password: string, salt: Buffer) {
  if (password.length < 12)
    throw new Error("Use a password with at least 12 characters.");
  return scryptSync(password, salt, 32, {
    N: ARCHIVE_SCRYPT_COST,
    r: ARCHIVE_SCRYPT_BLOCK_SIZE,
    p: ARCHIVE_SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
}

function isArchiveDocument(value: unknown): value is ArchiveDocument {
  if (!value || typeof value !== "object") return false;
  const archive = value as Partial<ArchiveDocument>;
  if (
    archive.format !== "local-notes-archive" ||
    archive.version !== 1 ||
    !Array.isArray(archive.notes) ||
    !Array.isArray(archive.assets)
  ) {
    return false;
  }
  return (
    archive.notes.every(
      (note) =>
        note &&
        typeof note === "object" &&
        typeof note.id === "string" &&
        ARCHIVE_ID_PATTERN.test(note.id) &&
        typeof note.title === "string" &&
        note.title.length <= 500 &&
        Boolean(note.content) &&
        typeof note.content === "object" &&
        !Array.isArray(note.content) &&
        typeof note.isPinned === "boolean" &&
        typeof note.createdAt === "string" &&
        typeof note.updatedAt === "string",
    ) &&
    archive.assets.every(
      (asset) =>
        asset &&
        typeof asset === "object" &&
        typeof asset.id === "string" &&
        ARCHIVE_ID_PATTERN.test(asset.id) &&
        typeof asset.data === "string" &&
        typeof asset.mimeType === "string" &&
        asset.mimeType in IMAGE_FORMATS,
    )
  );
}

export function encryptArchive(document: ArchiveDocument, password: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveArchiveKey(password, salt),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(document), "utf8"),
    cipher.final(),
  ]);
  return Buffer.from(
    JSON.stringify({
      format: "local-notes-encrypted-archive",
      version: 1,
      kdf: {
        name: "scrypt",
        cost: ARCHIVE_SCRYPT_COST,
        blockSize: ARCHIVE_SCRYPT_BLOCK_SIZE,
        parallelization: ARCHIVE_SCRYPT_PARALLELIZATION,
        salt: salt.toString("base64"),
      },
      cipher: {
        name: "aes-256-gcm",
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
      },
      ciphertext: ciphertext.toString("base64"),
    }),
    "utf8",
  );
}

export function decryptArchive(
  bytes: Buffer,
  password: string,
): ArchiveDocument {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid password or archive.");
  }

  try {
    const kdf = envelope.kdf as Record<string, unknown> | undefined;
    const cipher = envelope.cipher as Record<string, unknown> | undefined;
    if (
      envelope.format !== "local-notes-encrypted-archive" ||
      envelope.version !== 1 ||
      kdf?.name !== "scrypt" ||
      kdf.cost !== ARCHIVE_SCRYPT_COST ||
      kdf.blockSize !== ARCHIVE_SCRYPT_BLOCK_SIZE ||
      kdf.parallelization !== ARCHIVE_SCRYPT_PARALLELIZATION ||
      cipher?.name !== "aes-256-gcm" ||
      typeof kdf.salt !== "string" ||
      typeof cipher.iv !== "string" ||
      typeof cipher.tag !== "string" ||
      typeof envelope.ciphertext !== "string"
    ) {
      throw new Error("Invalid envelope.");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveArchiveKey(password, Buffer.from(kdf.salt, "base64")),
      Buffer.from(cipher.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(cipher.tag, "base64"));
    const plainText = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    const archive: unknown = JSON.parse(plainText.toString("utf8"));
    if (!isArchiveDocument(archive)) throw new Error("Invalid archive.");
    return archive;
  } catch {
    throw new Error("Invalid password or archive.");
  }
}
