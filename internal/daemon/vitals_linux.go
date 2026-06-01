//go:build linux

package daemon

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

var (
	cpuMu        sync.Mutex
	prevCPUIdle  uint64
	prevCPUTotal uint64
)

func collectVitals() ServerVitals {
	v := ServerVitals{}

	// CPU%
	if f, err := os.Open("/proc/stat"); err == nil {
		scanner := bufio.NewScanner(f)
		if scanner.Scan() {
			line := scanner.Text()
			fields := strings.Fields(line)
			if len(fields) >= 8 && fields[0] == "cpu" {
				var vals [8]uint64
				for i := 1; i <= 8; i++ {
					vals[i-1], _ = strconv.ParseUint(fields[i], 10, 64)
				}
				idle := vals[3] + vals[4] // idle + iowait
				var total uint64
				for _, val := range vals {
					total += val
				}
				cpuMu.Lock()
				if prevCPUTotal == 0 {
					v.CPUPercent = 0.0
				} else {
					deltaTotal := total - prevCPUTotal
					deltaIdle := idle - prevCPUIdle
					if deltaTotal > 0 {
						v.CPUPercent = (1.0 - float64(deltaIdle)/float64(deltaTotal)) * 100.0
					}
				}
				prevCPUIdle = idle
				prevCPUTotal = total
				cpuMu.Unlock()
				v.CPUAvailable = true
			}
		}
		f.Close()
	}

	// Total RAM and used RAM from /proc/meminfo
	// used = MemTotal - MemAvailable (accounts for reclaimable cache)
	if f, err := os.Open("/proc/meminfo"); err == nil {
		var memTotal, memAvailable uint64
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := scanner.Text()
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}
			kb, err := strconv.ParseUint(fields[1], 10, 64)
			if err != nil {
				continue
			}
			switch fields[0] {
			case "MemTotal:":
				memTotal = kb * 1024
			case "MemAvailable:":
				memAvailable = kb * 1024
			}
		}
		f.Close()
		v.RAMTotal = memTotal
		if memTotal > memAvailable {
			v.RAMUsed = memTotal - memAvailable
		}
	}

	// Disk via syscall.Statfs
	var stat syscall.Statfs_t
	if err := syscall.Statfs(".", &stat); err == nil {
		v.DiskTotal = stat.Blocks * uint64(stat.Bsize)
		v.DiskUsed = (stat.Blocks - stat.Bfree) * uint64(stat.Bsize)
	}

	return v
}
