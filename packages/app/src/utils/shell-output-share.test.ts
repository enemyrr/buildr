import { describe, expect, it } from "vitest";
import { formatShellOutputShare } from "./shell-output-share";

describe("formatShellOutputShare", () => {
  it("wraps the output in a fence with the command and exit code", () => {
    expect(
      formatShellOutputShare({
        type: "shell",
        command: "./dev db push",
        output: "\nChanges applied\n\n",
        exitCode: 0,
      }),
    ).toBe("I ran `./dev db push` (exit code 0):\n\n```\nChanges applied\n```");
  });

  it("uses a longer fence when the output contains one", () => {
    expect(
      formatShellOutputShare({ type: "shell", command: "cat README.md", output: "```ts\nx\n```" }),
    ).toBe("I ran `cat README.md`:\n\n````\n```ts\nx\n```\n````");
  });
});
