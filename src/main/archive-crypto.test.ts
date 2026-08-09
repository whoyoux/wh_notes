import { describe, expect, it } from "vitest";
import {
  decryptArchive,
  encryptArchive,
  type ArchiveDocument,
} from "./archive-crypto";

const password = "a-private-archive-password";
const archive: ArchiveDocument = {
  format: "local-notes-archive",
  version: 1,
  exportedAt: "2026-08-09T12:00:00.000Z",
  notes: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Private note",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Only on this device" }],
          },
        ],
      },
      isPinned: false,
      createdAt: "2026-08-09T12:00:00.000Z",
      updatedAt: "2026-08-09T12:00:00.000Z",
    },
  ],
  assets: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      mimeType: "image/png",
      data: "iVBORw0KGgo=",
    },
  ],
};

describe("encrypted archive format", () => {
  it("round-trips notes and local image payloads through AES-256-GCM", () => {
    const encrypted = encryptArchive(archive, password);

    expect(encrypted.toString("utf8")).not.toContain("Only on this device");
    expect(decryptArchive(encrypted, password)).toEqual(archive);
  });

  it("uses a fresh salt and IV for every export", () => {
    expect(encryptArchive(archive, password)).not.toEqual(
      encryptArchive(archive, password),
    );
  });

  it("rejects an incorrect password and tampered ciphertext", () => {
    const encrypted = encryptArchive(archive, password);
    expect(() => decryptArchive(encrypted, "another-private-password")).toThrow(
      "Invalid password or archive",
    );

    const tampered = JSON.parse(encrypted.toString("utf8")) as {
      ciphertext: string;
    };
    tampered.ciphertext = `${tampered.ciphertext.startsWith("A") ? "B" : "A"}${tampered.ciphertext.slice(1)}`;
    expect(() =>
      decryptArchive(Buffer.from(JSON.stringify(tampered)), password),
    ).toThrow("Invalid password or archive");
  });

  it("requires a password with at least 12 characters", () => {
    expect(() => encryptArchive(archive, "short")).toThrow("at least 12");
  });
});
