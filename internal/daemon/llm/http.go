package llm

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptrace"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

// sharedHTTPTransport is used by every adapter so we can close idle pool
// connections between retry attempts. A poisoned half-open connection
// pinned in this pool would otherwise silently fail every retry.
var sharedHTTPTransport = func() *http.Transport {
	t := http.DefaultTransport.(*http.Transport).Clone()
	return t
}()

// SharedHTTPClient returns the package-wide HTTP client. Adapters install
// per-instance wrappers (header strip/set, lifecycle logging) by composing
// transports on top of this client's Transport, then passing the wrapped
// client to their SDK via that SDK's WithHTTPClient option.
func SharedHTTPClient() *http.Client {
	return &http.Client{Transport: sharedHTTPTransport}
}

// TLSMaterial names the (resolved) file paths for a provider's mutual-TLS
// configuration. It is comparable so it can key the transport cache directly.
type TLSMaterial struct {
	ClientCert string // path to the client certificate (PEM)
	ClientKey  string // path to the client private key (PEM)
	CACert     string // optional path to a CA bundle (PEM) to verify the server
}

// empty reports whether no mTLS material is configured (the common case).
func (m TLSMaterial) empty() bool {
	return m.ClientCert == "" && m.ClientKey == "" && m.CACert == ""
}

var (
	tlsTransportMu sync.Mutex
	tlsTransports  = map[TLSMaterial]*http.Transport{}
)

// baseTransportFor returns the base RoundTripper a client should sit on for a
// provider with the given mTLS material. Empty material returns the shared
// transport unchanged (zero behavior change for every ordinary provider).
// Non-empty material returns a cloned transport whose TLSClientConfig presents
// the client certificate.
//
// Transports are cached by material: NewFromModel runs once per turn, so
// building a fresh transport (and thus a fresh connection pool + TLS handshake)
// every time would defeat pooling and leak connections. The cache also doubles
// as the registry CloseIdleHTTPConnections sweeps between retries, so an mTLS
// provider still benefits from the poisoned-connection cleanup the shared
// transport was built for.
func baseTransportFor(m TLSMaterial) (http.RoundTripper, error) {
	if m.empty() {
		return sharedHTTPTransport, nil
	}
	tlsTransportMu.Lock()
	defer tlsTransportMu.Unlock()
	if t, ok := tlsTransports[m]; ok {
		return t, nil
	}
	tlsCfg, err := buildTLSConfig(m)
	if err != nil {
		return nil, err
	}
	t := sharedHTTPTransport.Clone()
	t.TLSClientConfig = tlsCfg
	tlsTransports[m] = t
	return t, nil
}

// buildTLSConfig assembles a *tls.Config from mTLS material: a client
// certificate (cert+key, both required together) and an optional CA pool used to
// verify the server. Encrypted (passphrase-protected) private keys are not
// supported — tls.LoadX509KeyPair rejects them with a clear error.
func buildTLSConfig(m TLSMaterial) (*tls.Config, error) {
	cfg := &tls.Config{}
	if m.ClientCert != "" || m.ClientKey != "" {
		if m.ClientCert == "" || m.ClientKey == "" {
			return nil, fmt.Errorf("mTLS: client_cert and client_key must both be set")
		}
		cert, err := tls.LoadX509KeyPair(m.ClientCert, m.ClientKey)
		if err != nil {
			return nil, fmt.Errorf("mTLS: load client cert/key: %w", err)
		}
		cfg.Certificates = []tls.Certificate{cert}
	}
	if m.CACert != "" {
		pem, err := os.ReadFile(m.CACert)
		if err != nil {
			return nil, fmt.Errorf("mTLS: read ca_cert: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("mTLS: ca_cert %q contains no valid certificates", m.CACert)
		}
		cfg.RootCAs = pool
	}
	return cfg, nil
}

// CloseIdleHTTPConnections drops all pooled connections in the shared
// transport and every cached mTLS transport. Called between retries so a
// poisoned conn doesn't get reused on the next attempt.
func CloseIdleHTTPConnections() {
	sharedHTTPTransport.CloseIdleConnections()
	tlsTransportMu.Lock()
	for _, t := range tlsTransports {
		t.CloseIdleConnections()
	}
	tlsTransportMu.Unlock()
}

// NewPluginHTTPClient returns an *http.Client whose Transport applies the
// plugin's header set/strip rules to every outgoing request, then delegates
// to base (the shared transport, or a per-provider mTLS transport). The
// lifecycle-logging transport is composed on the outside (see
// NewLoggingTransport) so the log ordering is:
//
//	request → loggingTransport → headerStripperTransport → base
//
// A nil base falls back to the shared transport. When pc has no headers the
// header layer is skipped, but logging (and the chosen base) are preserved.
func NewPluginHTTPClient(pc PluginConfig, base http.RoundTripper) *http.Client {
	if base == nil {
		base = sharedHTTPTransport
	}
	if len(pc.Headers) == 0 {
		return &http.Client{Transport: NewLoggingTransport(base)}
	}

	set := make(map[string]string)
	var strip []string
	for name, val := range pc.Headers {
		canonical := http.CanonicalHeaderKey(name)
		if val == nil {
			strip = append(strip, canonical)
		} else {
			set[canonical] = *val
		}
	}

	header := &headerStripperTransport{
		base:  base,
		set:   set,
		strip: strip,
	}
	return &http.Client{Transport: NewLoggingTransport(header)}
}

// headerStripperTransport applies plugin header mutations to every
// outgoing request before delegating to base.
type headerStripperTransport struct {
	base  http.RoundTripper
	set   map[string]string
	strip []string
}

func (h *headerStripperTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	for k, v := range h.set {
		req.Header.Set(k, v)
	}
	for _, k := range h.strip {
		req.Header.Del(k)
	}
	return h.base.RoundTrip(req)
}

// NewLoggingTransport returns a RoundTripper that attaches an
// httptrace.ClientTrace and logs a compact lifecycle summary per request.
// When VIX_STREAM_DEBUG=1 it also wraps the response body to count bytes
// and log when the first body byte arrives.
//
// This is the provider-agnostic replacement for streamDebugMiddleware
// (formerly typed for anthropic-sdk-go's option.Middleware).
func NewLoggingTransport(base http.RoundTripper) http.RoundTripper {
	return &loggingTransport{base: base}
}

type loggingTransport struct {
	base http.RoundTripper
}

func (l *loggingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	reqID := RequestIDFromContext(req.Context())
	if reqID == "" {
		reqID = NewRequestID()
	}
	t0 := time.Now()

	var (
		dnsStart, dnsDone   time.Time
		connStart, connDone time.Time
		tlsStart, tlsDone   time.Time
		wroteReq            time.Time
		firstByte           time.Time
		reused              bool
		remoteAddr          string
		connectErr, tlsErr  error
	)
	trace := &httptrace.ClientTrace{
		DNSStart:     func(httptrace.DNSStartInfo) { dnsStart = time.Now() },
		DNSDone:      func(httptrace.DNSDoneInfo) { dnsDone = time.Now() },
		ConnectStart: func(_, _ string) { connStart = time.Now() },
		ConnectDone: func(_, _ string, err error) {
			connDone = time.Now()
			connectErr = err
		},
		TLSHandshakeStart: func() { tlsStart = time.Now() },
		TLSHandshakeDone: func(_ tls.ConnectionState, err error) {
			tlsDone = time.Now()
			tlsErr = err
		},
		GotConn: func(info httptrace.GotConnInfo) {
			reused = info.Reused
			if info.Conn != nil {
				remoteAddr = info.Conn.RemoteAddr().String()
			}
		},
		WroteRequest:         func(httptrace.WroteRequestInfo) { wroteReq = time.Now() },
		GotFirstResponseByte: func() { firstByte = time.Now() },
	}
	ctx := httptrace.WithClientTrace(req.Context(), trace)
	req = req.WithContext(ctx)

	resp, err := l.base.RoundTrip(req)

	status := 0
	if resp != nil {
		status = resp.StatusCode
	}
	log.Printf("[httpx req=%s] dns=%s connect=%s tls=%s wrote_req=%s first_byte=%s status=%d reused=%v remote=%s err=%v connect_err=%v tls_err=%v",
		reqID,
		DurStr(dnsStart, dnsDone),
		DurStr(connStart, connDone),
		DurStr(tlsStart, tlsDone),
		DurStr(t0, wroteReq),
		DurStr(t0, firstByte),
		status, reused, remoteAddr, err, connectErr, tlsErr,
	)

	if resp != nil && StreamDebugVerbose() {
		resp.Body = &countingBody{
			ReadCloser: resp.Body,
			reqID:      reqID,
			t0:         t0,
		}
	}
	return resp, err
}

// countingBody wraps an SSE response body to log byte counts and
// first-byte latency. Only installed when VIX_STREAM_DEBUG=1 to keep prod
// log volume low.
type countingBody struct {
	io.ReadCloser
	reqID     string
	t0        time.Time
	firstByte time.Time
	bytes     int64
	closed    atomic.Bool
}

func (b *countingBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	if n > 0 && b.firstByte.IsZero() {
		b.firstByte = time.Now()
		log.Printf("[httpx req=%s] stream_first_body_byte=%dms",
			b.reqID, time.Since(b.t0).Milliseconds())
	}
	b.bytes += int64(n)
	return n, err
}

func (b *countingBody) Close() error {
	if b.closed.Swap(true) {
		return b.ReadCloser.Close()
	}
	fb := "never"
	if !b.firstByte.IsZero() {
		fb = DurStr(b.t0, b.firstByte)
	}
	log.Printf("[httpx req=%s] stream_body_close bytes=%d first_byte=%s elapsed=%s",
		b.reqID, b.bytes, fb, time.Since(b.t0))
	return b.ReadCloser.Close()
}
