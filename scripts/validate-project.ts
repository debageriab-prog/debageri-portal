import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => arg.replace(/^--/, "").split("=") as [string, string]),
);
const target = args.get("target") ?? "dev";
const expected =
  target === "prod" ? "debageri-portal-prod" : "debageri-portal-dev";
const rc = JSON.parse(readFileSync(resolve(".firebaserc"), "utf8")) as {
  projects?: Record<string, string>;
};
const actual = rc.projects?.[`portal-${target}`];
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
