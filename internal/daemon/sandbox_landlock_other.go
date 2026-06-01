//go:build !linux

package daemon

import (
	"context"
	"fmt"
	"os"
	"os/exec"
)

// LandlockExecMain is a no-op stub on non-Linux platforms. It exists so
// cmd/vixd/main.go can dispatch to it unconditionally without
// build-tagged imports. Called only when argv[1]=="landlock-exec",
// which never happens off Linux because landlockSupported() returns
// false and detectSandbox never picks sandboxLandlock.
func LandlockExecMain(argv []string) {
	fmt.Fprintln(os.Stderr, "landlock-exec: only supported on Linux")
	os.Exit(2)
}

// landlockSupported is always false off Linux — the sandbox detector
// skips the Landlock branch entirely on darwin/windows/etc.
func landlockSupported() bool { return false }

// landlockBashCmd should never be reached off Linux (detectSandbox would
// have chosen sandboxSeatbelt or sandboxNone). Provided so sandbox.go
// compiles on darwin without per-OS build tags on the case statement.
func landlockBashCmd(ctx context.Context, command, cwd string, extraDirs []string) *exec.Cmd {
	panic("landlockBashCmd called on non-Linux platform")
}
