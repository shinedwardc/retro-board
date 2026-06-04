import { describe, it, expect, assert } from "vitest";
import { parseRoomFromPath, roomPath } from "../src/utils/session";

describe("Session function tests", () => {
    it("Verify room code string should be same regardless of upper/lower case", () => {
        const upper = "ABCDE";
        const lower = "abcde";

        expect(parseRoomFromPath(roomPath(upper))).toEqual(parseRoomFromPath(roomPath(lower)));
    });

    it("Verify room code gets extracted correctly from parseRoomFromPath", () => {
        const path = roomPath("ABC") + "/settings";
        expect(parseRoomFromPath(path)).toEqual("ABC");
    });
    
    it("Verify return null when room code is empty from path", () => {
        const path = roomPath("");
        expect(parseRoomFromPath(path)).toBeNull();
    });

    it("Verify path that doesn't start with correct prefix (/room/)", () => {
        expect(parseRoomFromPath("/app/room/ABC")).toBeNull();
    });

    it("Assert roomPath having proper prefix and roomCode format", () => {
        assert(roomPath("ABCDE").slice(0,6) == "/room/");
    })
})
