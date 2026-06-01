//go:build !linux

package daemon

// setOOMScore is a no-op on non-Linux platforms.
func setOOMScore(pid, score int) {}

// ProtectDaemon is a no-op on non-Linux platforms.
func ProtectDaemon() {}
