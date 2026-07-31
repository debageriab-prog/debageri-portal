import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const expected = {
  prod: "debageri-portal",
  dev: "debageri-portal-dev",
} as const;
const rc = JSON.parse(readFileSync(resolve(".firebaserc"), "utf8")) as {
  projects?: Record<string, string>;
};

for (const [alias, projectId] of Object.entries(expected)) {
  const actual = rc.projects?.[alias];
  if (
    !actual ||
    /^debageri-web(?:-|$)/i.test(actual) ||
    !actual.includes("portal")
  ) {
    throw new Error(
      `Unsafe Firebase target for ${alias}: ${actual ?? "missing"}`,
    );
  }
  if (actual !== projectId)
    throw new Error(`Expected ${alias}=${projectId}, received ${actual}`);
}

console.log(
  `Validated Firebase deployment targets: prod=${expected.prod}, dev=${expected.dev}`,
);
