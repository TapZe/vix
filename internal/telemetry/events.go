package telemetry

// TrackTUIStarted records that the TUI or headless client launched.
func TrackTUIStarted(appMode, appVersion string) {
	Track("tui_started", map[string]interface{}{
		"app_mode":    appMode,
		"app_version": appVersion,
	})
}

// TrackDaemonStarted records daemon startup duration.
func TrackDaemonStarted(startupDurationMs int64) {
	Track("daemon_started", map[string]interface{}{
		"startup_duration_ms": startupDurationMs,
	})
}
