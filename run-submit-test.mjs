import { execSync } from "child_process";
import { writeFileSync } from "fs";

const marker = "SUBMIT_ACTION_TEST_" + Date.now();
let output = marker + "\n";

try {
  const result = execSync(
    "npx vitest run lib/hooks/__tests__/use-submit-action.test.ts --reporter verbose",
    {
      cwd: "d:/Projects/Shadow-Hunt",
      encoding: "utf8",
      timeout: 90000,
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  output += "STATUS: PASS\n" + result;
} catch (e) {
  output += "STATUS: " + (e.status === null ? "TIMEOUT" : "FAIL:" + e.status) + "\n";
  output += "STDOUT:\n" + (e.stdout || "(empty)") + "\n";
  output += "STDERR:\n" + (e.stderr || "(empty)") + "\n";
}

writeFileSync("d:/Projects/Shadow-Hunt/submit-test-result.txt", output, "utf8");
console.log("Done: " + marker);
