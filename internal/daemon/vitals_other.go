//go:build !linux && !darwin

package daemon

func collectVitals() ServerVitals {
	return ServerVitals{}
}
