package daemon

import (
	"os"
	"sync"
)

// tmpLogDir is where the daemon writes its non-LLM log files
// (vix-thinking.log, vix-bash-history.log, vix-jobs/). When unset,
// callers fall back to os.TempDir() so default behaviour matches the
// pre-flag era.
//
// LLM call JSON logs are intentionally NOT routed through this — they
// live under ~/.vix/logs and are managed by SetLLMLogDir.
var (
	tmpLogDirMu sync.RWMutex
	tmpLogDir   string
)

// SetTmpLogDir sets the directory used for daemon log files. Empty
// string restores the os.TempDir() default.
func SetTmpLogDir(dir string) {
	tmpLogDirMu.Lock()
	tmpLogDir = dir
	tmpLogDirMu.Unlock()
}

// TmpLogDir returns the configured daemon log directory, or os.TempDir()
// if SetTmpLogDir has not been called.
func TmpLogDir() string {
	tmpLogDirMu.RLock()
	d := tmpLogDir
	tmpLogDirMu.RUnlock()
	if d == "" {
		return os.TempDir()
	}
	return d
}
