import { describe, expect, it } from "vitest";
import generateRoomCode from "../src/utils/generateRoomCode";

describe("Generate Room Code", () => {
    it("Creates a random room 6 letter string code", () => {
        expect(generateRoomCode()).toBeTypeOf("string");
    });
});