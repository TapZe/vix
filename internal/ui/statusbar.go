package ui

import (
	"fmt"
	"strings"
	"time"

	"charm.land/lipgloss/v2"
)

// renderStatusBar renders the two-line status bar.
//
// Line 1 — always visible: shortcut hints on the left, connection status on the right.
// Line 2 — transient: a message (warning / info / error) shown for 3 s then cleared;
// rendered as a blank line when there is no active message so the layout stays stable.
func renderStatusBar(
	width int,
	connected bool,
	reconnecting bool,
	msg StatusMessage,
	s Styles,
) string {
	// ── Line 1: shortcuts + connection status ───────────────────────────────
	badgeStyle := lipgloss.NewStyle().Background(colorSecondary).Foreground(lipgloss.Color("0")).Bold(true)
	labelStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("15"))
	f1Badge := badgeStyle.Render(" F1 ")
	f2Badge := badgeStyle.Render(" F2 ")
	f3Badge := badgeStyle.Render(" F3 ")
	tabBadge := badgeStyle.Render(" Tab ")
	shiftTabBadge := badgeStyle.Render(" Shift+Tab ")
	ctrlTBadge := badgeStyle.Render(" Ctrl+T ")
	shortcuts := f1Badge + labelStyle.Render(" Sessions ") +
		f2Badge + labelStyle.Render(" Workspace ") +
		f3Badge + labelStyle.Render(" Settings ") +
		tabBadge + labelStyle.Render(" Switch focus ") +
		shiftTabBadge + labelStyle.Render(" Workflows ") +
		ctrlTBadge + labelStyle.Render(" New session")

	var connStatus string
	if connected {
		connStatus = statusConnectedStyle.Render("● Connected")
	} else if reconnecting {
		connStatus = statusReconnectingStyle.Render("● Reconnecting")
	} else {
		connStatus = statusDisconnectedStyle.Render("● Disconnected")
	}

	shortcutsLen := lipgloss.Width(shortcuts)
	connLen := lipgloss.Width(connStatus)
	totalContent := shortcutsLen + connLen
	remaining := width - totalContent - 2
	if remaining < 2 {
		remaining = 2
	}
	leftPad := remaining / 2
	rightPad := remaining - leftPad
	line1 := strings.Repeat(" ", leftPad) + shortcuts + strings.Repeat(" ", rightPad) + connStatus

	// ── Line 2: transient message ───────────────────────────────────────────
	var line2 string
	if msg.Text != "" {
		var msgStyle lipgloss.Style
		var prefix string
		switch msg.Kind {
		case StatusMsgWarning:
			msgStyle = lipgloss.NewStyle().Foreground(colorWarning).Italic(true)
			prefix = " ⚠ "
		case StatusMsgError:
			msgStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Bold(true)
			prefix = " ✖ "
		default: // StatusMsgInfo
			msgStyle = lipgloss.NewStyle().Foreground(s.ColorDimGray).Italic(true)
			prefix = " ℹ "
		}
		line2 = msgStyle.Render(prefix + msg.Text)
	}
	// Always pad line 2 to full width so the layout never shifts.
	line2 = lipgloss.NewStyle().Width(width).Render(line2)

	return line2 + "\n" + s.StatusBarStyle.Width(width).Render(line1)
}

func formatTokenCount(n int64) string {
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	return fmt.Sprintf("%dk", n/1000)
}

func formatDuration(d time.Duration) string {
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	if h > 0 {
		return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%02d:%02d", m, s)
}
