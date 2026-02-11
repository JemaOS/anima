import { describe, it, expect } from "vitest";
import {
  generateRoomCode,
  isValidRoomCode,
  getInitials,
  formatDuration,
} from "../../utils/helpers";

describe("Helpers Unit Tests", () => {
  describe("generateRoomCode", () => {
    it("should generate a code in format xxx-yyy-zzz", () => {
      const code = generateRoomCode();
      expect(code).toMatch(/^[a-z]{3}-[a-z]{3}-[a-z]{3}$/);
    });

    it("should generate different codes", () => {
      const code1 = generateRoomCode();
      const code2 = generateRoomCode();
      expect(code1).not.toBe(code2);
    });
  });

  describe("isValidRoomCode", () => {
    it("should return true for valid codes", () => {
      expect(isValidRoomCode("abc-def-ghi")).toBe(true);
    });

    it("should return false for invalid codes", () => {
      expect(isValidRoomCode("abc-def-gh")).toBe(false);
      expect(isValidRoomCode("abc-def-gh1")).toBe(false);
      expect(isValidRoomCode("ABC-DEF-GHI")).toBe(false);
      expect(isValidRoomCode("")).toBe(false);
    });
  });

  describe("getInitials", () => {
    it("should return initials for single name", () => {
      expect(getInitials("John")).toBe("J");
    });

    it("should return initials for two names", () => {
      expect(getInitials("John Doe")).toBe("JD");
    });

    it("should return max 2 chars", () => {
      expect(getInitials("John Doe Smith")).toBe("JD");
    });
  });

  describe("formatDuration", () => {
    it("should format seconds correctly", () => {
      expect(formatDuration(30)).toBe("0:30");
      expect(formatDuration(65)).toBe("1:05");
      expect(formatDuration(3600)).toBe("1:00:00");
      expect(formatDuration(3665)).toBe("1:01:05");
    });
  });
});
