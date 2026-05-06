import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const backendRoot = process.cwd();

const findGitRoot = (startDir) => {
  let currentDir = startDir;

  while (true) {
    if (existsSync(path.join(currentDir, ".git"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error("Git root not found from SeoulMate_BE.");
    }

    currentDir = parentDir;
  }
};

const gitRoot = findGitRoot(backendRoot);
const gitExecutable = existsSync("C:\\Program Files\\Git\\cmd\\git.exe")
  ? "C:\\Program Files\\Git\\cmd\\git.exe"
  : "git";

const runGit = (args) => {
  const result = spawnSync(gitExecutable, args, {
    cwd: gitRoot,
    stdio: "pipe",
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
};

const hooksBaseDir = path.join(gitRoot, "SeoulMate_BE", ".husky");
const hooksInternalDir = path.join(hooksBaseDir, "_");

mkdirSync(hooksInternalDir, { recursive: true });

writeFileSync(path.join(hooksInternalDir, ".gitignore"), "*\n");
writeFileSync(
  path.join(hooksInternalDir, "h"),
  `#!/usr/bin/env sh
[ "$HUSKY" = "2" ] && set -x
n=$(basename "$0")
s=$(dirname "$(dirname "$0")")/$n

[ ! -f "$s" ] && exit 0

[ "\${HUSKY-}" = "0" ] && exit 0

export PATH="node_modules/.bin:$PATH"
sh -e "$s" "$@"
c=$?

[ $c != 0 ] && echo "husky - $n script failed (code $c)"
[ $c = 127 ] && echo "husky - command not found in PATH=$PATH"
exit $c
`,
  { mode: 0o755 }
);
writeFileSync(
  path.join(hooksInternalDir, "pre-commit"),
  `#!/usr/bin/env sh
. "$(dirname "$0")/h"
`,
  { mode: 0o755 }
);
writeFileSync(
  path.join(hooksBaseDir, "pre-commit"),
  'cd "$(dirname "$0")/.." || exit 1\nnpx lint-staged\n',
  { mode: 0o755 }
);

runGit(["config", "core.hooksPath", "SeoulMate_BE/.husky/_"]);
