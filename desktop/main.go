package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Assets are populated from an explicit production allowlist by build.ps1.
//
//go:embed all:assets/*
var embeddedAssets embed.FS

const defaultPort = 47831
const maxJSON = 2 << 20
const sessionCookie = "ntk_desktop_session"

var uuidRE = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type config struct {
	port           int
	dataDir        string
	headless       bool
	idleTimeout    time.Duration
	startupTimeout time.Duration
}

type desktopApp struct {
	assets        fs.FS
	client        *http.Client
	host          string
	token         string
	modelDirs     []string
	mu            sync.Mutex
	lastHeartbeat time.Time
	started       time.Time
	connected     bool
}

func init() {
	for ext, kind := range map[string]string{".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".onnx": "application/octet-stream"} {
		_ = mime.AddExtensionType(ext, kind)
	}
}

func newToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func fileExists(p string) bool { s, err := os.Stat(p); return err == nil && s.Mode().IsRegular() }

// Resolve once and dial a checked IP, preventing DNS rebinding at connection time.
func publicIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsValid() || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	for _, cidr := range []string{"0.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "::/96", "64:ff9b::/96", "64:ff9b:1::/48", "100::/64", "2001::/32", "2001:db8::/32", "2002::/16", "fc00::/7", "fe80::/10"} {
		if netip.MustParsePrefix(cidr).Contains(ip) {
			return false
		}
	}
	return true
}

func validateURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") || strings.ContainsAny(raw, "\\\r\n") {
		return nil, errors.New("a public HTTP or HTTPS URL is required")
	}
	if port := u.Port(); port != "" && !((u.Scheme == "https" && port == "443") || (u.Scheme == "http" && port == "80")) {
		return nil, errors.New("only standard HTTP and HTTPS ports are allowed")
	}
	h := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if h == "localhost" || strings.HasSuffix(h, ".localhost") || strings.HasSuffix(h, ".local") || !strings.Contains(h, ".") && !strings.Contains(h, ":") {
		return nil, errors.New("local destinations are not allowed")
	}
	if ip, err := netip.ParseAddr(h); err == nil && !publicIP(ip) {
		return nil, errors.New("private or reserved destinations are not allowed")
	}
	return u, nil
}

type lookupFunc func(context.Context, string) ([]net.IPAddr, error)

func publicDialer(lookup lookupFunc) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil || (port != "80" && port != "443") {
			return nil, errors.New("destination port blocked")
		}
		ips, err := lookup(ctx, host)
		if err != nil || len(ips) == 0 {
			return nil, errors.New("destination DNS lookup failed")
		}
		for _, ip := range ips {
			addr, ok := netip.AddrFromSlice(ip.IP)
			if !ok || !publicIP(addr) {
				return nil, errors.New("destination DNS resolved to a private or reserved address")
			}
		}
		dialer := net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
		var last error
		for _, ip := range ips {
			conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
			if err == nil {
				return conn, nil
			}
			last = err
		}
		return nil, last
	}
}

func safeClient() *http.Client {
	transport := &http.Transport{Proxy: nil, DialContext: publicDialer(net.DefaultResolver.LookupIPAddr), TLSHandshakeTimeout: 10 * time.Second, ResponseHeaderTimeout: 20 * time.Second, MaxIdleConns: 16, IdleConnTimeout: 30 * time.Second}
	return &http.Client{Transport: transport, Timeout: 90 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		_, err := validateURL(req.URL.String())
		return err
	}}
}

func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func apiError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]any{"success": false, "error": message})
}

func method(w http.ResponseWriter, r *http.Request, methods ...string) bool {
	for _, m := range methods {
		if r.Method == m {
			return true
		}
	}
	w.Header().Set("Allow", strings.Join(methods, ", "))
	apiError(w, http.StatusMethodNotAllowed, "Method not allowed")
	return false
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSON)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		apiError(w, http.StatusBadRequest, "Invalid or oversized JSON body")
		return false
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		apiError(w, http.StatusBadRequest, "Expected one JSON object")
		return false
	}
	return true
}

func (a *desktopApp) touch() {
	a.mu.Lock()
	a.lastHeartbeat = time.Now()
	a.connected = true
	a.mu.Unlock()
}
func (a *desktopApp) expired(now time.Time, idle, startup time.Duration) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.connected {
		return now.Sub(a.started) > startup
	}
	return now.Sub(a.lastHeartbeat) > idle
}

// The entry page establishes a random HttpOnly session. APIs require that
// session and matching Host/Origin. Cross-site bootstrap is blocked as well.
func (a *desktopApp) secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "credentialless")
		if r.Host != a.host {
			apiError(w, http.StatusForbidden, "Unexpected host")
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+a.host {
			apiError(w, http.StatusForbidden, "Cross-origin requests are blocked")
			return
		}
		if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "none" && site != "same-origin" {
			apiError(w, http.StatusForbidden, "Cross-site requests are blocked")
			return
		}
		if strings.Contains(r.URL.Path, "\\") {
			apiError(w, http.StatusBadRequest, "Invalid path")
			return
		}
		for _, part := range strings.Split(r.URL.Path, "/") {
			if part == ".." || part == "." {
				apiError(w, http.StatusBadRequest, "Invalid path")
				return
			}
		}
		isEntry := r.URL.Path == "/" || r.URL.Path == "/index.html"
		cookie, err := r.Cookie(sessionCookie)
		authed := err == nil && subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(a.token)) == 1
		if isEntry && (r.Method == "GET" || r.Method == "HEAD") {
			http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: a.token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
		} else if !authed {
			apiError(w, http.StatusUnauthorized, "Open the desktop application before making requests")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *desktopApp) request(ctx context.Context, method, target string, body io.Reader) (*http.Response, error) {
	if _, err := validateURL(target); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "NTK-OmniStream-Studio/2026.11")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return a.client.Do(req)
}

func (a *desktopApp) proxyJSON(w http.ResponseWriter, r *http.Request, method, target string, body io.Reader) {
	resp, err := a.request(r.Context(), method, target, body)
	if err != nil {
		apiError(w, http.StatusBadGateway, "Could not reach the public provider")
		return
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, maxJSON+1))
	if err != nil || len(b) > maxJSON || !json.Valid(b) {
		apiError(w, http.StatusBadGateway, "Provider returned invalid or oversized JSON")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(b)
}

func sunoHost(h string) bool {
	h = strings.ToLower(h)
	return h == "suno.com" || h == "www.suno.com" || h == "suno.ai" || h == "www.suno.ai"
}
func sunoID(raw string) string {
	if uuidRE.MatchString(raw) {
		return strings.ToLower(raw)
	}
	u, err := validateURL(raw)
	if err != nil || !sunoHost(u.Hostname()) {
		return ""
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) == 2 && parts[0] == "song" && uuidRE.MatchString(parts[1]) {
		return strings.ToLower(parts[1])
	}
	return ""
}

func (a *desktopApp) resolveSuno(ctx context.Context, raw string) (string, error) {
	if id := sunoID(raw); id != "" {
		return id, nil
	}
	u, err := validateURL(raw)
	if err != nil || !sunoHost(u.Hostname()) || !strings.HasPrefix(u.Path, "/s/") {
		return "", errors.New("a Suno song URL, shortlink or UUID is required")
	}
	client := *a.client
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 || !sunoHost(req.URL.Hostname()) {
			return errors.New("Suno redirect destination blocked")
		}
		_, err := validateURL(req.URL.String())
		return err
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	resp, err := client.Do(req)
	if err != nil {
		return "", errors.New("could not resolve the Suno shortlink")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", errors.New("Suno shortlink is unavailable")
	}
	id := sunoID(resp.Request.URL.String())
	if id == "" {
		return "", errors.New("Suno shortlink did not resolve to a song")
	}
	return id, nil
}

func (a *desktopApp) routes() http.Handler {
	mux := http.NewServeMux()
	status := func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "GET") {
			return
		}
		jsonResponse(w, 200, map[string]any{"status": "ok", "mode": "desktop-native", "version": "2026.11-repair", "persistent_origin": true})
	}
	mux.HandleFunc("/api/desktop/status", status)
	mux.HandleFunc("/api/health", status)
	mux.HandleFunc("/api/desktop/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "POST") {
			return
		}
		a.touch()
		w.WriteHeader(http.StatusNoContent)
	})
	// No unload shutdown endpoint: navigation/reload cannot terminate the backend.
	mux.HandleFunc("/api/capabilities", func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "GET") {
			return
		}
		jsonResponse(w, 200, map[string]any{"server": "OmniStream Desktop", "mode": "standalone-native", "yt_dlp": false, "ffmpeg": false, "download_jobs": false, "suno_drm": true, "demucs": map[string]any{"available": false, "engine": "Browser engine requires its runtime and model", "local_model": a.modelPath("htdemucs_embedded.onnx") != ""}})
	})
	mux.HandleFunc("/api/mango/rights", func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "POST") {
			return
		}
		var p struct {
			ContentID     string `json:"content_id"`
			UUID          string `json:"uuid"`
			ContentParams struct {
				ContentID string `json:"content_id"`
			} `json:"content_params"`
		}
		if !decodeJSON(w, r, &p) {
			return
		}
		id := p.ContentParams.ContentID
		if id == "" {
			id = p.ContentID
		}
		if id == "" {
			id = p.UUID
		}
		if !uuidRE.MatchString(id) {
			apiError(w, 400, "A valid Suno UUID is required")
			return
		}
		b, _ := json.Marshal(map[string]any{"content_params": map[string]string{"content_id": strings.ToLower(id), "content_type": "clip"}})
		a.proxyJSON(w, r, "POST", "https://studio-api.prod.suno.com/api/mango/rights", bytes.NewReader(b))
	})
	for _, prefix := range []string{"/api/clip/", "/api/suno/song/", "/api/suno/clip/", "/api/playlist/", "/api/suno/playlist/"} {
		prefix := prefix
		mux.HandleFunc(prefix, func(w http.ResponseWriter, r *http.Request) {
			if !method(w, r, "GET") {
				return
			}
			id := strings.TrimPrefix(r.URL.Path, prefix)
			if !uuidRE.MatchString(id) {
				apiError(w, 400, "A valid Suno UUID is required")
				return
			}
			kind := "clip"
			if strings.Contains(prefix, "playlist") {
				kind = "playlist"
			}
			target := "https://studio-api.prod.suno.com/api/" + kind + "/" + strings.ToLower(id)
			if page := r.URL.Query().Get("page"); page != "" {
				if !regexp.MustCompile(`^[1-9][0-9]{0,3}$`).MatchString(page) {
					apiError(w, 400, "Invalid page")
					return
				}
				target += "/?page=" + page
			}
			a.proxyJSON(w, r, "GET", target, nil)
		})
	}
	mux.HandleFunc("/api/suno/unshorten", func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "GET") {
			return
		}
		id, err := a.resolveSuno(r.Context(), r.URL.Query().Get("url"))
		if err != nil {
			apiError(w, 400, err.Error())
			return
		}
		jsonResponse(w, 200, map[string]any{"status": "ok", "uuid": id, "target_url": "https://suno.com/song/" + id})
	})
	mux.HandleFunc("/api/suno/stream/", func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "GET", "HEAD") {
			return
		}
		id := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/suno/stream/"), ".m4a")
		if !uuidRE.MatchString(id) {
			apiError(w, 400, "A valid Suno UUID is required")
			return
		}
		target := "https://d2lwuy8qc234o3.cloudfront.net/1/clip/" + strings.ToLower(id) + ".m4a"
		req, _ := http.NewRequestWithContext(r.Context(), r.Method, target, nil)
		if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
			if !regexp.MustCompile(`^bytes=[0-9]*-[0-9]*$`).MatchString(rangeHeader) {
				apiError(w, 400, "Only a single byte range is supported")
				return
			}
			req.Header.Set("Range", rangeHeader)
		}
		resp, err := a.client.Do(req)
		if err != nil {
			apiError(w, 502, "Could not reach the audio provider")
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 && resp.StatusCode != 206 {
			apiError(w, resp.StatusCode, "Audio provider could not supply this track")
			return
		}
		if resp.ContentLength > 512<<20 {
			apiError(w, 502, "Audio exceeds the desktop streaming limit")
			return
		}
		for _, h := range []string{"Content-Length", "Content-Range", "Accept-Ranges", "Content-Type"} {
			if v := resp.Header.Get(h); v != "" {
				w.Header().Set(h, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		if r.Method != "HEAD" {
			_, _ = io.Copy(w, io.LimitReader(resp.Body, 512<<20))
		}
	})
	mux.HandleFunc("/api/omni/resolve", a.resolveMedia)
	mux.HandleFunc("/api/omni/download", func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "POST") {
			return
		}
		var p struct {
			URL       string `json:"url"`
			Format    string `json:"format"`
			AudioOnly bool   `json:"is_audio_only"`
		}
		if !decodeJSON(w, r, &p) {
			return
		}
		apiError(w, http.StatusNotImplemented, "Download conversion jobs are not supported by this portable build. Use Suno audio, a direct media URL, or import a local audio file. No download was started.")
	})
	mux.HandleFunc("/api/omni/status/", func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "GET") {
			return
		}
		apiError(w, 404, "No such download job exists")
	})
	mux.HandleFunc("/models/", func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "GET", "HEAD") {
			return
		}
		name := strings.TrimPrefix(r.URL.Path, "/models/")
		if name != "htdemucs_embedded.onnx" {
			http.NotFound(w, r)
			return
		}
		p := a.modelPath(name)
		if p == "" {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, p)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if !method(w, r, "GET", "HEAD") {
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			apiError(w, 404, "Endpoint not found")
			return
		}
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name == "" {
			name = "index.html"
		}
		if !fs.ValidPath(name) {
			http.NotFound(w, r)
			return
		}
		data, err := fs.ReadFile(a.assets, name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		if contentType := mime.TypeByExtension(path.Ext(name)); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
	})
	return a.secure(mux)
}

func (a *desktopApp) modelPath(name string) string {
	for _, dir := range a.modelDirs {
		p := filepath.Join(dir, name)
		if fileExists(p) {
			return p
		}
	}
	return ""
}

func (a *desktopApp) resolveMedia(w http.ResponseWriter, r *http.Request) {
	if !method(w, r, "GET") {
		return
	}
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	u, err := validateURL(raw)
	if err != nil {
		apiError(w, 400, err.Error())
		return
	}
	if sunoHost(u.Hostname()) {
		id, err := a.resolveSuno(r.Context(), raw)
		if err != nil {
			apiError(w, 400, err.Error())
			return
		}
		a.proxyJSON(w, r, "GET", "https://studio-api.prod.suno.com/api/clip/"+id, nil)
		return
	}
	ext := strings.ToLower(path.Ext(u.Path))
	switch ext {
	case ".mp3", ".wav", ".m4a", ".mp4", ".flac", ".ogg", ".webm":
	default:
		apiError(w, 422, "This desktop build supports Suno links and direct media files. Import a local file for other sources.")
		return
	}
	resp, err := a.request(r.Context(), "HEAD", raw, nil)
	if err != nil {
		apiError(w, 502, "Could not verify the public media URL")
		return
	}
	resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		apiError(w, 422, "The media URL is unavailable")
		return
	}
	id, err := newToken()
	if err != nil {
		apiError(w, 500, "Could not allocate a media identifier")
		return
	}
	id = "direct-" + id[:16]
	jsonResponse(w, 200, map[string]any{"type": "single", "uuid": id, "id": id, "title": strings.TrimSuffix(path.Base(u.Path), ext), "artist": "Direct Web Stream", "duration": 0, "imageLarge": "", "imageThumb": "", "streamUrl": resp.Request.URL.String(), "url": raw, "platform": "Direct Media File", "hasVideo": ext == ".mp4" || ext == ".webm", "hasAudio": true, "hasStem": false, "tags": strings.ToUpper(strings.TrimPrefix(ext, ".")) + " Stream"})
}

func run(cfg config) error {
	if cfg.port < 1 || cfg.port > 65535 {
		return errors.New("port must be between 1 and 65535; the desktop origin must remain stable")
	}
	if cfg.idleTimeout < 10*time.Second || cfg.startupTimeout < 10*time.Second {
		return errors.New("lifecycle timeouts must be at least 10 seconds")
	}
	if err := os.MkdirAll(cfg.dataDir, 0700); err != nil {
		return fmt.Errorf("data directory is not writable: %w", err)
	}
	logFile, err := os.OpenFile(filepath.Join(cfg.dataDir, "desktop.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("data directory is not writable: %w", err)
	}
	defer logFile.Close()
	log.SetOutput(io.MultiWriter(os.Stderr, logFile))
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", cfg.port))
	if err != nil {
		return fmt.Errorf("desktop port %d is unavailable; close the other instance and retry. The app will not switch ports and hide your saved data: %w", cfg.port, err)
	}
	defer listener.Close()
	assets, err := fs.Sub(embeddedAssets, "assets")
	if err != nil {
		return err
	}
	token, err := newToken()
	if err != nil {
		return err
	}
	exe, _ := os.Executable()
	a := &desktopApp{assets: assets, client: safeClient(), host: listener.Addr().String(), token: token, modelDirs: []string{filepath.Join(cfg.dataDir, "models"), filepath.Join(filepath.Dir(exe), "models")}, started: time.Now(), lastHeartbeat: time.Now()}
	server := &http.Server{Handler: a.routes(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 120 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 << 10}
	serverErr := make(chan error, 1)
	go func() { serverErr <- server.Serve(listener) }()
	defer server.Close()
	appURL := "http://" + a.host
	if cfg.headless {
		fmt.Printf("{\"url\":%q,\"mode\":\"headless\"}\n", appURL)
	} else if err := launchBrowser(appURL, cfg.dataDir); err != nil {
		return err
	}
	log.Printf("Desktop ready at %s (stable origin; prior browser profiles retained)", appURL)
	signalCh := make(chan os.Signal, 1)
	signal.Notify(signalCh, os.Interrupt)
	defer signal.Stop(signalCh)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case err := <-serverErr:
			if err == http.ErrServerClosed {
				return nil
			}
			return err
		case <-signalCh:
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			return server.Shutdown(ctx)
		case now := <-ticker.C:
			if a.expired(now, cfg.idleTimeout, cfg.startupTimeout) {
				log.Print("Desktop closed after heartbeat timeout")
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				return server.Shutdown(ctx)
			}
		}
	}
}

func main() {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	var cfg config
	flag.IntVar(&cfg.port, "port", defaultPort, "Stable loopback port; changing it selects different browser storage")
	flag.StringVar(&cfg.dataDir, "data-dir", filepath.Join(base, "NTKOmniStreamStudio"), "Durable app data directory (use a separate directory for tests)")
	flag.BoolVar(&cfg.headless, "headless", false, "Start only the loopback service; do not open a browser or existing profile")
	flag.DurationVar(&cfg.idleTimeout, "idle-timeout", 90*time.Second, "Exit after this interval without a heartbeat")
	flag.DurationVar(&cfg.startupTimeout, "startup-timeout", 90*time.Second, "Exit if no UI connects within this interval")
	flag.Parse()
	if err := run(cfg); err != nil {
		log.Printf("Desktop could not start: %v", err)
		if !cfg.headless {
			showStartupError(err.Error())
		}
		os.Exit(1)
	}
}
