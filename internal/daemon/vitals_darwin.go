//go:build darwin

package daemon

import (
	"encoding/binary"
	"sync"
	"syscall"

	"golang.org/x/sys/unix"
)

var (
	cpuMu        sync.Mutex
	prevCPUIdle  int64
	prevCPUTotal int64
)

func collectVitals() ServerVitals {
	v := ServerVitals{}

	// CPU% from kern.cp_times
	if b, err := unix.SysctlRaw("kern.cp_times"); err == nil {
		// Each CPU has 5 int32 values: user, nice, sys, intr, idle
		const valuesPerCPU = 5
		const bytesPerValue = 4
		const bytesPerCPU = valuesPerCPU * bytesPerValue
		numCPUs := len(b) / bytesPerCPU
		var idle, total int64
		for i := 0; i < numCPUs; i++ {
			base := i * bytesPerCPU
			var vals [5]int32
			for j := 0; j < valuesPerCPU; j++ {
				vals[j] = int32(binary.LittleEndian.Uint32(b[base+j*bytesPerValue:]))
			}
			// vals: [user, nice, sys, intr, idle]
			idle += int64(vals[4])
			for _, val := range vals {
				total += int64(val)
			}
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

	// Total RAM from hw.memsize (8 bytes, little-endian)
	if b, err := unix.SysctlRaw("hw.memsize"); err == nil && len(b) == 8 {
		v.RAMTotal = binary.LittleEndian.Uint64(b)
	}

	// System-wide RAM used = total - free_pages * page_size
	if b, err := unix.SysctlRaw("hw.pagesize"); err == nil {
		var pageSize uint64
		switch len(b) {
		case 4:
			pageSize = uint64(binary.LittleEndian.Uint32(b))
		case 8:
			pageSize = binary.LittleEndian.Uint64(b)
		}
		if b2, err := unix.SysctlRaw("vm.page_free_count"); err == nil {
			var freePages uint64
			switch len(b2) {
			case 4:
				freePages = uint64(binary.LittleEndian.Uint32(b2))
			case 8:
				freePages = binary.LittleEndian.Uint64(b2)
			}
			if pageSize > 0 {
				free := freePages * pageSize
				if v.RAMTotal > free {
					v.RAMUsed = v.RAMTotal - free
				}
			}
		}
	}

	// Disk via syscall.Statfs (Bsize is int32 on Darwin)
	var stat syscall.Statfs_t
	if err := syscall.Statfs(".", &stat); err == nil {
		v.DiskTotal = stat.Blocks * uint64(stat.Bsize)
		v.DiskUsed = (stat.Blocks - stat.Bfree) * uint64(stat.Bsize)
	}

	return v
}
