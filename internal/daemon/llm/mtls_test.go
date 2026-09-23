package llm

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// --- test PKI helpers -------------------------------------------------------

func genTestCA(t *testing.T) (*x509.Certificate, *ecdsa.PrivateKey, []byte) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("gen CA key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "vix-test-ca"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create CA cert: %v", err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse CA cert: %v", err)
	}
	return cert, key, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
}

func genTestLeaf(t *testing.T, ca *x509.Certificate, caKey *ecdsa.PrivateKey, cn string, ips []net.IP, server bool) (certPEM, keyPEM []byte) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("gen leaf key: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: cn},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		IPAddresses:  ips,
	}
	if server {
		tmpl.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
	} else {
		tmpl.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, ca, &key.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create leaf cert: %v", err)
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal leaf key: %v", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}),
		pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
}

// mtlsFixture builds a CA, a server cert, and a client cert; writes the client
// cert/key and the CA bundle to temp files; and returns an mTLS-requiring test
// server plus the TLSMaterial pointing at the on-disk files.
func mtlsFixture(t *testing.T) (*httptest.Server, TLSMaterial, string) {
	t.Helper()
	ca, caKey, caPEM := genTestCA(t)
	srvCertPEM, srvKeyPEM := genTestLeaf(t, ca, caKey, "localhost", []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback}, true)
	cliCertPEM, cliKeyPEM := genTestLeaf(t, ca, caKey, "vix-client", nil, false)

	dir := t.TempDir()
	caFile := filepath.Join(dir, "ca.pem")
	cliCertFile := filepath.Join(dir, "client.crt")
	cliKeyFile := filepath.Join(dir, "client.key")
	for _, f := range []struct {
		path string
		data []byte
	}{{caFile, caPEM}, {cliCertFile, cliCertPEM}, {cliKeyFile, cliKeyPEM}} {
		if err := os.WriteFile(f.path, f.data, 0o600); err != nil {
			t.Fatalf("write %s: %v", f.path, err)
		}
	}

	srvCert, err := tls.X509KeyPair(srvCertPEM, srvKeyPEM)
	if err != nil {
		t.Fatalf("server keypair: %v", err)
	}
	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caPEM) {
		t.Fatal("failed to add CA to pool")
	}

	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	srv.TLS = &tls.Config{
		Certificates: []tls.Certificate{srvCert},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    caPool,
	}
	srv.StartTLS()
	t.Cleanup(srv.Close)

	return srv, TLSMaterial{ClientCert: cliCertFile, ClientKey: cliKeyFile, CACert: caFile}, caFile
}

// --- tests ------------------------------------------------------------------

// TestMTLS_ClientCertAcceptedAndRequired is the core proof: a server that
// requires a verified client certificate accepts the request only when the
// provider is configured with the client cert, and rejects it (TLS handshake
// failure) when the cert is absent.
func TestMTLS_ClientCertAcceptedAndRequired(t *testing.T) {
	srv, mat, caFile := mtlsFixture(t)

	// With client cert: request succeeds.
	base, err := baseTransportFor(mat)
	if err != nil {
		t.Fatalf("baseTransportFor(with cert): %v", err)
	}
	client := NewPluginHTTPClient(PluginConfig{}, base)
	resp, err := client.Get(srv.URL)
	if err != nil {
		t.Fatalf("request with client cert failed: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK || string(body) != "ok" {
		t.Fatalf("status=%d body=%q, want 200 ok", resp.StatusCode, body)
	}

	// Without client cert (only CA to trust the server): handshake rejected.
	baseNoCert, err := baseTransportFor(TLSMaterial{CACert: caFile})
	if err != nil {
		t.Fatalf("baseTransportFor(no cert): %v", err)
	}
	noCertClient := NewPluginHTTPClient(PluginConfig{}, baseNoCert)
	if _, err := noCertClient.Get(srv.URL); err == nil {
		t.Fatal("request without client cert unexpectedly succeeded; server should require mTLS")
	}
}

// recordingRT is a base RoundTripper that captures the headers it is handed,
// proving what the plugin/logging layers passed down.
type recordingRT struct{ got http.Header }

func (r *recordingRT) RoundTrip(req *http.Request) (*http.Response, error) {
	r.got = req.Header.Clone()
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader("")),
		Request:    req,
	}, nil
}

// TestMTLS_CompositionPreservesHeadersAndLogging guards the bug that motivated
// the refactor: routing over a custom base transport must NOT drop the plugin
// header set/strip layer or the lifecycle logging layer. We assert the outermost
// transport is the logging transport and that the base sees headers applied and
// stripped.
func TestMTLS_CompositionPreservesHeadersAndLogging(t *testing.T) {
	base := &recordingRT{}
	setVal := "applied"
	client := NewPluginHTTPClient(PluginConfig{
		Headers: map[string]*string{
			"X-Set":   &setVal,
			"X-Strip": nil,
		},
	}, base)

	if _, ok := client.Transport.(*loggingTransport); !ok {
		t.Fatalf("outermost transport = %T, want *loggingTransport (logging must still wrap the mTLS base)", client.Transport)
	}

	req, _ := http.NewRequest(http.MethodGet, "http://example.test/", nil)
	req.Header.Set("X-Strip", "should-be-removed")
	if _, err := client.Do(req); err != nil {
		t.Fatalf("Do: %v", err)
	}

	if got := base.got.Get("X-Set"); got != "applied" {
		t.Errorf("base saw X-Set=%q, want applied (plugin SET header lost over custom base)", got)
	}
	if got := base.got.Get("X-Strip"); got != "" {
		t.Errorf("base saw X-Strip=%q, want empty (plugin STRIP lost over custom base)", got)
	}
}

// TestMTLS_TransportCacheIdentity verifies transports are cached by material so
// NewFromModel (called per turn) reuses one connection pool instead of leaking a
// fresh transport each time. Empty material returns the shared transport.
func TestMTLS_TransportCacheIdentity(t *testing.T) {
	_, mat, caFile := mtlsFixture(t)

	t1, err := baseTransportFor(mat)
	if err != nil {
		t.Fatalf("baseTransportFor: %v", err)
	}
	t2, err := baseTransportFor(mat)
	if err != nil {
		t.Fatalf("baseTransportFor (2nd): %v", err)
	}
	if t1 != t2 {
		t.Error("same TLS material returned different transports; cache not reused (pool churn)")
	}

	// Different material → different transport.
	t3, err := baseTransportFor(TLSMaterial{CACert: caFile})
	if err != nil {
		t.Fatalf("baseTransportFor(diff): %v", err)
	}
	if t3 == t1 {
		t.Error("different TLS material returned the same transport")
	}

	// Empty material → the shared transport.
	got, err := baseTransportFor(TLSMaterial{})
	if err != nil {
		t.Fatalf("baseTransportFor(empty): %v", err)
	}
	if got != http.RoundTripper(sharedHTTPTransport) {
		t.Error("empty material did not return the shared transport")
	}
}

// TestMTLS_CloseIdleReachesCachedTransports verifies a cached mTLS transport is
// registered so CloseIdleHTTPConnections (run between retries) sweeps it too —
// restoring the poisoned-connection cleanup the shared transport was built for.
func TestMTLS_CloseIdleReachesCachedTransports(t *testing.T) {
	_, mat, _ := mtlsFixture(t)

	tr, err := baseTransportFor(mat)
	if err != nil {
		t.Fatalf("baseTransportFor: %v", err)
	}

	tlsTransportMu.Lock()
	cached, ok := tlsTransports[mat]
	tlsTransportMu.Unlock()
	if !ok {
		t.Fatal("mTLS transport not registered in the cache; CloseIdleHTTPConnections cannot reach it")
	}
	if http.RoundTripper(cached) != tr {
		t.Fatal("registered transport differs from the one returned")
	}

	// Must not panic and must include the cached transport in its sweep.
	CloseIdleHTTPConnections()
}

// TestMTLS_MissingCertPairRejected verifies an incomplete pair (cert without
// key) fails fast with a clear error rather than silently producing a bad client.
func TestMTLS_MissingCertPairRejected(t *testing.T) {
	if _, err := baseTransportFor(TLSMaterial{ClientCert: "/nope/only-cert.pem"}); err == nil {
		t.Fatal("expected error for client_cert without client_key")
	}
}
