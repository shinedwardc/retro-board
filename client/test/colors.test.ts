import { it, assert, describe, expect } from 'vitest';
import getUserColor from '../src/utils/colors.ts';

describe("Color functions", () => {
    it("Make sure that the same username returns same color (hash)", () => {
        const sameUserName1 = "abcd1234";
        const sameUserName2 = "abcd1234";
        expect(getUserColor(sameUserName1)).toEqual(getUserColor(sameUserName2));
    });

    it("Validate the output, the hash should spit out a palette token variable", () => {
        const colorVariable = /^var\(--color-user-\d+\)$/;
        expect(getUserColor("johnsmith123")).toMatch(colorVariable);
    });

    it("Generated names are actually distributed into colors", () => {
        const colorSet = new Set<String>();
        for (let i = 0; i < 50; i++) {
            const randomUsername = Math.random().toString(36).substring(2,8);
            colorSet.add(getUserColor(randomUsername));
        }
        assert(colorSet.size > 1)
    })

    it("Validate empty username does not run a valid color", () => {
        const emptyUserName = "";
        expect(() => getUserColor(emptyUserName)).toThrow(new Error("Username cannot be empty"));
    })
})