package main

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func testApp() *desktopApp {
	return &desktopApp{assets: fstest.MapFS{"index.html": {Data: []byte("fixture")}, "js/app.js": {Data: []byte("export const ok=true;")}}, client: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return nil, errors.New("external network disabled in tests")
	})}, host: "127.0.0.1:47831", token: "test-session", started: time.Now(), lastHeartbeat: time.Now()}
}
func serve(a *desktopApp, m, p, b string, authorized bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(m, "http://"+a.host+p, strings.NewReader(b))
	if authorized {
		r.AddCookie(&http.Cookie{Name: sessionCookie, Value: a.token})
	}
	w := httptest.NewRecorder()
	a.routes().ServeHTTP(w, r)
	return w
}

func TestSessionAndOriginGuards(t *testing.T) {
	a := testApp()
	if w := serve(a, "GET", "/api/capabilities", "", false); w.Code != 401 {
		t.Fatalf("missing session: %d", w.Code)
	}
	if w := serve(a, "GET", "/", "", false); w.Code != 200 || !strings.Contains(w.Header().Get("Set-Cookie"), "HttpOnly") {
		t.Fatal("entry did not establish protected session")
	}
	for _, tc := range []struct{ host, origin, site string }{{"evil.example:47831", "", ""}, {a.host, "https://evil.example", ""}, {a.host, "", "cross-site"}, {a.host, "", "same-site"}} {
		r := httptest.NewRequest("POST", "http://"+a.host+"/api/desktop/heartbeat", nil)
		r.Host = tc.host
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Sec-Fetch-Site", tc.site)
		r.AddCookie(&http.Cookie{Name: sessionCookie, Value: a.token})
		w := httptest.NewRecorder()
		a.routes().ServeHTTP(w, r)
		if w.Code != 403 {
			t.Errorf("guard accepted %+v: %d", tc, w.Code)
		}
	}
	if w := serve(a, "POST", "/api/desktop/heartbeat", "", true); w.Code != 204 {
		t.Fatalf("same-origin heartbeat failed: %d", w.Code)
	}
	if w := serve(a, "GET", "/api/desktop/shutdown", "", true); w.Code != 404 {
		t.Fatal("shutdown endpoint must not exist")
	}
}

func TestMethodErrorsAndMissingAssets(t *testing.T) {
	a := testApp()
	for _, tc := range []struct {
		method, path string
		status       int
	}{{"GET", "/api/desktop/heartbeat", 405}, {"POST", "/js/app.js", 405}, {"GET", "/missing.js", 404}, {"GET", "/api/unknown", 404}, {"GET", "/models/../secret.txt", 400}, {"GET", "/models/other.onnx", 404}, {"GET", "/models/..%5csecret.txt", 400}} {
		w := serve(a, tc.method, tc.path, "", true)
		if w.Code != tc.status {
			t.Errorf("%s %s: got %d want %d", tc.method, tc.path, w.Code, tc.status)
		}
	}
}

func TestTruthfulUnsupportedJobs(t *testing.T) {
	a := testApp()
	w := serve(a, "POST", "/api/omni/download", `{"url":"https://www.youtube.com/watch?v=x","format":"mp3"}`, true)
	if w.Code != 501 || strings.Contains(w.Body.String(), "job_id") {
		t.Fatalf("invented job: %d %s", w.Code, w.Body.String())
	}
	if w := serve(a, "GET", "/api/omni/status/fabricated", "", true); w.Code != 404 {
		t.Fatal("unknown job was accepted")
	}
	if w := serve(a, "GET", "/api/capabilities", "", true); !strings.Contains(w.Body.String(), `"available":false`) || !strings.Contains(w.Body.String(), `"download_jobs":false`) {
		t.Fatal("capabilities claim absent engines")
	}
}

func TestBoundedBodiesAndIDs(t *testing.T) {
	a := testApp()
	for _, body := range []string{`{"uuid":"bad"}`, `{} {}`, `{"uuid":"` + strings.Repeat("x", maxJSON) + `"}`} {
		if w := serve(a, "POST", "/api/mango/rights", body, true); w.Code != 400 {
			t.Errorf("invalid body got %d", w.Code)
		}
	}
	for _, p := range []string{"/api/clip/prefix-12345678-1234-1234-1234-123456789abc", "/api/playlist/not-a-uuid", "/api/suno/stream/https:evil"} {
		if w := serve(a, "GET", p, "", true); w.Code != 400 {
			t.Errorf("invalid ID got %d", w.Code)
		}
	}
}

func TestURLAndIPPolicy(t *testing.T) {
	for _, raw := range []string{"file:///C:/secret.mp3", "http://localhost/a.mp3", "http://127.0.0.1/a.mp3", "http://192.168.0.1/a.mp3", "https://public.example:8443/a", "https://name:password@public.example/a", "http://[::1]/a", "http://public.example\\@127.0.0.1/a"} {
		if _, err := validateURL(raw); err == nil {
			t.Errorf("accepted %s", raw)
		}
	}
	for _, raw := range []string{"https://cdn.suno.ai/a.mp3", "https://example.com:443/a.mp3?x=1", "http://example.com/a.mp3"} {
		if _, err := validateURL(raw); err != nil {
			t.Errorf("rejected public URL %s: %v", raw, err)
		}
	}
	for _, ip := range []string{"127.0.0.1", "10.1.2.3", "192.168.1.2", "169.254.169.254", "100.64.0.1", "::1", "::ffff:127.0.0.1", "2001:db8::1", "64:ff9b::7f00:1"} {
		if publicIP(netip.MustParseAddr(ip)) {
			t.Errorf("accepted restricted %s", ip)
		}
	}
	if !publicIP(netip.MustParseAddr("8.8.8.8")) {
		t.Fatal("rejected public IPv4")
	}
}

func TestDNSMixedAndRebindingTargetsBlocked(t *testing.T) {
	for _, ips := range [][]net.IPAddr{{{IP: net.ParseIP("127.0.0.1")}}, {{IP: net.ParseIP("8.8.8.8")}, {IP: net.ParseIP("10.0.0.1")}}} {
		dial := publicDialer(func(context.Context, string) ([]net.IPAddr, error) { return ips, nil })
		if _, err := dial(context.Background(), "tcp", "example.com:443"); err == nil || !strings.Contains(err.Error(), "private") {
			t.Fatal("private DNS target was not blocked before dial")
		}
	}
	c := safeClient()
	u, _ := url.Parse("http://127.0.0.1/private")
	if err := c.CheckRedirect(&http.Request{URL: u}, nil); err == nil {
		t.Fatal("private redirect accepted")
	}
}

func TestShortlinkScopeAndRedirect(t *testing.T) {
	a := testApp()
	calls := 0
	a.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{"http://127.0.0.1/private"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})}
	if _, err := a.resolveSuno(context.Background(), "https://suno.com/s/abc"); err == nil {
		t.Fatal("unsafe redirect accepted")
	}
	if calls != 1 {
		t.Fatalf("redirect was fetched: %d requests", calls)
	}
	calls = 0
	if _, err := a.resolveSuno(context.Background(), "https://attacker.example/s/a"); err == nil || calls != 0 {
		t.Fatal("non-Suno shortlink was requested")
	}
}

func TestHeartbeatReloadLifecycle(t *testing.T) {
	a := testApp()
	now := time.Now()
	a.started = now.Add(-100 * time.Second)
	if !a.expired(now, 90*time.Second, 90*time.Second) {
		t.Fatal("failed browser startup leaked server")
	}
	a.touch()
	if a.expired(time.Now().Add(4*time.Second), 90*time.Second, 90*time.Second) {
		t.Fatal("reload grace prematurely expires")
	}
	if !a.expired(time.Now().Add(91*time.Second), 90*time.Second, 90*time.Second) {
		t.Fatal("closed browser did not expire")
	}
}

func TestProxySizeAndRange(t *testing.T) {
	a := testApp()
	id := "12345678-1234-1234-1234-123456789abc"
	a.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.Path, "/clip/") && strings.HasSuffix(r.URL.Path, ".m4a") {
			if r.Header.Get("Range") != "bytes=10-19" {
				t.Error("range not forwarded")
			}
			return &http.Response{StatusCode: 206, Header: http.Header{"Content-Type": []string{"audio/mp4"}, "Content-Range": []string{"bytes 10-19/100"}}, Body: io.NopCloser(strings.NewReader("0123456789")), ContentLength: 10, Request: r}, nil
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"x":"` + strings.Repeat("a", maxJSON) + `"}`)), Request: r}, nil
	})}
	if w := serve(a, "GET", "/api/clip/"+id, "", true); w.Code != 502 {
		t.Fatal("oversized provider body accepted")
	}
	r := httptest.NewRequest("GET", "http://"+a.host+"/api/suno/stream/"+id, nil)
	r.AddCookie(&http.Cookie{Name: sessionCookie, Value: a.token})
	r.Header.Set("Range", "bytes=10-19")
	w := httptest.NewRecorder()
	a.routes().ServeHTTP(w, r)
	if w.Code != 206 || w.Body.String() != "0123456789" || w.Header().Get("Content-Range") != "bytes 10-19/100" {
		t.Fatalf("range forwarding failed: %d %s", w.Code, w.Body.String())
	}
}
