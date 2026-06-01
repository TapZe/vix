//go:build linux

package daemon

import (
	"fmt"
	"os"
	"strconv"
)

// setOOMScore adjusts the OOM killer priority for a given process.
// Positive values (max 1000) make the process more likely to be killed;
// negative values (min -1000) make it less likely. Best-effort: failures
// are logged but not fatal.
func setOOMScore(pid, score int) {
	path := fmt.Sprintf("/proc/%d/oom_score_adj", pid)
	if err := os.WriteFile(path, []byte(strconv.Itoa(score)), 0644); err != nil {
		LogInfo("[oom] failed to set oom_score_adj=%d for pid %d: %v", score, pid, err)
	}
}

// ProtectDaemon lowers the current process's OOM score so the kernel
// prefers killing child processes (which should be set to 1000) first.
func ProtectDaemon() {
	setOOMScore(os.Getpid(), -500)
}
