import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const tests = readdirSync("tests")
  .filter(name => /^(stock.*|suppliers|login-security)\.test\.tsx?$/.test(name))
  .sort()
  .map(name => `tests/${name}`);
if (!tests.length) throw new Error("No stock tests found.");
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...tests], { stdio: "inherit" });
process.exit(result.status ?? 1);
