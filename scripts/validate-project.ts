import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const expected = "debageri-portal-prod";
const rc = JSON.parse(readFileSync(resolve(".firebaserc"), "utf8")) as {
  projects?: Record<string, string>;
};
const actual = rc.projects?.["portal-prod"];
if (
  !actual ||
  /^debageri-web(?:-|$)/i.test(actual) ||
  !actual.includes("portal")
) {
  throw new Error(`Unsafe Firebase target: ${actual ?? "missing"}`);
}
if (actual !== expected)
  throw new Error(`Expected ${expected}, received ${actual}`);
console.log(`Validated Firebase deployment target: ${actual}`);
