#!/usr/bin/env node
// Claude Code PermissionRequest hook: lets you answer permission prompts from the Jarvis Office dashboard.
// If the office isn't running, or nobody has it open, or nobody answers in time, it prints nothing and
// Claude Code asks in the terminal as usual. Standard library only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

const dir = path.join(os.homedir(), ".jarvis-office");
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let token, port;
  try {
    token = fs.readFileSync(path.join(dir, "hook-token"), "utf8").trim();
    port = Number(fs.readFileSync(path.join(dir, "port"), "utf8").trim());
  } catch { process.exit(0); }
  const req = http.request({ host: "127.0.0.1", port, path: "/hook/permission", method: "POST", timeout: 115000,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` } }, (res) => {
    let s = "";
    res.on("data", (c) => (s += c));
    res.on("end", () => {
      try {
        const { decision } = JSON.parse(s);
        if (decision === "allow" || decision === "deny") {
          const out = { behavior: decision };
          if (decision === "deny") out.message = "Denied from the Jarvis Office dashboard.";
          process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: out } }));
        }
      } catch { /* fall through to the terminal prompt */ }
      process.exit(0);
    });
  });
  req.on("error", () => process.exit(0));
  req.on("timeout", () => { req.destroy(); process.exit(0); });
  req.end(input || "{}");
});
