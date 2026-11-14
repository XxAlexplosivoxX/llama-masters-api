package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/XxAlexplosivoxX/llama-masters-api/internal/cache"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/config"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/push"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/store"
)

const (
	fixture = "../../testdata/tiny-region"
	token   = "test-token"
)

func newServer(t *testing.T) (*httptest.Server, *store.Store) {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	cfg := config.Config{APIToken: token, CORSOrigins: []string{"*"}, CacheHTTPMaxAge: time.Minute,
		MaxUploadBytes: 8 << 20, KeepVersions: 2, HotspotLimitDefault: 4, HotspotLimitMax: 100}
	c := cache.New(64, time.Minute, 1<<20)
	srv := httptest.NewServer(New(cfg, st, c, slog.New(slog.NewTextHandler(io.Discard, nil))))
	t.Cleanup(srv.Close)
	return srv, st
}

func upload(t *testing.T, srv *httptest.Server, dir, name string) map[string]any {
	t.Helper()
	result, err := push.Push(context.Background(), srv.Client(), srv.URL, token, dir, name)
	if err != nil {
		t.Fatalf("upload: %v %v", err, result)
	}
	return result
}

func get(t *testing.T, srv *httptest.Server, path string, header ...string) (*http.Response, []byte) {
	t.Helper()
	req, _ := http.NewRequest("GET", srv.URL+path, nil)
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	resp, err := http.DefaultTransport.RoundTrip(req) // no transparent gzip, so headers are visible
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp, body
}

func decode[T any](t *testing.T, body []byte) T {
	t.Helper()
	var value T
	if err := json.Unmarshal(body, &value); err != nil {
		t.Fatalf("decoding %s: %v", body, err)
	}
	return value
}

func TestWriteRoutesNeedToken(t *testing.T) {
	srv, _ := newServer(t)
	for _, auth := range []string{"", "Bearer wrong"} {
		req, _ := http.NewRequest("PUT", srv.URL+"/v1/regions/tiny", strings.NewReader("x"))
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		resp, err := srv.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("auth %q: status %d, want 401", auth, resp.StatusCode)
		}
	}
	if _, err := push.Push(context.Background(), srv.Client(), srv.URL, "wrong", fixture, "tiny"); err == nil {
		t.Error("push with a wrong token must fail")
	}
}

func TestUploadAndRead(t *testing.T) {
	srv, _ := newServer(t)
	result := upload(t, srv, fixture, "tiny")
	if result["weekly_rows"] != 12.0 || result["hotspots"] != 6.0 || result["areas"] != 2.0 {
		t.Fatalf("upload result: %v", result)
	}

	_, body := get(t, srv, "/v1/regions")
	index := decode[[]map[string]any](t, body)
	if len(index) != 1 || index[0]["name"] != "tiny" || !reflect.DeepEqual(index[0]["platforms"], []any{"NOAA-20", "S-NPP"}) {
		t.Fatalf("index: %s", body)
	}

	// The core contract rule: weeks without source data stay null, never 0.
	_, body = get(t, srv, "/v1/regions/tiny/weekly?area_id=north&platform=S-NPP")
	rows := decode[[]map[string]any](t, body)
	if len(rows) != 3 || rows[2]["reported_detections"] != nil || rows[2]["source_days"] != 0.0 || rows[1]["reported_detections"] != 3.0 {
		t.Fatalf("weekly north S-NPP: %s", body)
	}
	_, body = get(t, srv, "/v1/regions/tiny/weekly?from=2026-11-09&platform=NOAA-20")
	if rows := decode[[]map[string]any](t, body); len(rows) != 2 {
		t.Fatalf("weekly from filter: %s", body)
	}

	resp, body := get(t, srv, "/v1/regions/tiny/hotspots?day=2026-11-12&platform=NOAA-20")
	fc := decode[map[string]any](t, body)
	if features := fc["features"].([]any); len(features) != 2 || resp.Header.Get("X-Truncated") != "false" {
		t.Fatalf("hotspots by day: %s", body)
	}
	resp, body = get(t, srv, "/v1/regions/tiny/hotspots?bbox=-90,13,-88.8,14.1")
	if features := decode[map[string]any](t, body)["features"].([]any); len(features) != 2 {
		t.Fatalf("hotspots by bbox: %s", body)
	}
	resp, body = get(t, srv, "/v1/regions/tiny/hotspots?area_id=south")
	if features := decode[map[string]any](t, body)["features"].([]any); len(features) != 3 {
		t.Fatalf("hotspots by area: %s", body)
	}
	resp, body = get(t, srv, "/v1/regions/tiny/hotspots") // default limit 4 of 6, newest first
	features := decode[map[string]any](t, body)["features"].([]any)
	first := features[0].(map[string]any)["properties"].(map[string]any)
	if len(features) != 4 || resp.Header.Get("X-Truncated") != "true" || first["acquired_utc"] != "2026-11-14T05:03Z" {
		t.Fatalf("hotspots limit: %d features, truncated=%s, first=%v", len(features), resp.Header.Get("X-Truncated"), first)
	}

	for path, want := range map[string]int{
		"/v1/regions/nope/weekly":                  404,
		"/v1/regions/tiny/weekly?platform=GOES":    400,
		"/v1/regions/tiny/hotspots?bbox=1,2,3":     400,
		"/v1/regions/tiny/hotspots?limit=1000":     400,
		"/v1/regions/tiny/hotspots?day=14-11-2026": 400,
		"/tiny/secrets.txt":                        404,
	} {
		if resp, body := get(t, srv, path); resp.StatusCode != want {
			t.Errorf("%s: status %d (%s), want %d", path, resp.StatusCode, body, want)
		}
	}
}

func TestCompatibilityFilesMatchUpload(t *testing.T) {
	srv, _ := newServer(t)
	upload(t, srv, fixture, "tiny")
	for _, file := range []string{"metadata.json", "areas.geojson", "weekly_activity.json", "hotspots.geojson"} {
		original, err := os.ReadFile(filepath.Join(fixture, file))
		if err != nil {
			t.Fatal(err)
		}
		_, served := get(t, srv, "/tiny/"+file)
		if !reflect.DeepEqual(normalize(t, original), normalize(t, served)) {
			t.Errorf("%s differs:\noriginal %s\nserved   %s", file, original, served)
		}
	}
}

// normalize decodes JSON and sorts area_ids lists, whose order carries no meaning.
func normalize(t *testing.T, data []byte) any {
	value := decode[any](t, data)
	var walk func(any)
	walk = func(v any) {
		switch v := v.(type) {
		case map[string]any:
			if ids, ok := v["area_ids"].([]any); ok {
				sort.Slice(ids, func(i, j int) bool { return ids[i].(string) < ids[j].(string) })
			}
			for _, child := range v {
				walk(child)
			}
		case []any:
			for _, child := range v {
				walk(child)
			}
		}
	}
	walk(value)
	return value
}

func TestCachingAndInvalidation(t *testing.T) {
	srv, st := newServer(t)
	upload(t, srv, fixture, "tiny")
	path := "/v1/regions/tiny/weekly?platform=NOAA-20"
	first, body1 := get(t, srv, path)
	second, _ := get(t, srv, path)
	if first.Header.Get("X-Cache") != "MISS" || second.Header.Get("X-Cache") != "HIT" {
		t.Fatalf("X-Cache: %s then %s", first.Header.Get("X-Cache"), second.Header.Get("X-Cache"))
	}
	if !strings.HasPrefix(first.Header.Get("Cache-Control"), "public, max-age=60") {
		t.Errorf("Cache-Control: %s", first.Header.Get("Cache-Control"))
	}
	etag := first.Header.Get("ETag")
	if resp, body := get(t, srv, path, "If-None-Match", etag); resp.StatusCode != 304 || len(body) != 0 {
		t.Fatalf("revalidation: %d", resp.StatusCode)
	}
	if resp, _ := get(t, srv, "/v1/regions/tiny/hotspots?limit=100", "Accept-Encoding", "gzip"); resp.Header.Get("Content-Encoding") != "gzip" {
		t.Errorf("hotspots should be gzip-encoded when accepted")
	}

	// A new upload with different data must be served immediately, with a new ETag.
	changed := t.TempDir()
	for _, file := range []string{"metadata.json", "areas.geojson", "weekly_activity.json", "hotspots.geojson"} {
		data, _ := os.ReadFile(filepath.Join(fixture, file))
		if file == "weekly_activity.json" {
			data = []byte(strings.Replace(string(data), `"reported_detections": 15`, `"reported_detections": 99`, 1))
		}
		os.WriteFile(filepath.Join(changed, file), data, 0o644)
	}
	result := upload(t, srv, changed, "tiny")
	after, body2 := get(t, srv, path)
	if after.Header.Get("X-Cache") != "MISS" || after.Header.Get("ETag") == etag || string(body1) == string(body2) ||
		!strings.Contains(string(body2), `"reported_detections":99`) {
		t.Fatalf("after re-upload: cache=%s etag=%s body=%s", after.Header.Get("X-Cache"), after.Header.Get("ETag"), body2)
	}
	region, _ := st.Region(context.Background(), "tiny")
	if float64(region.Version) != result["version"] {
		t.Fatalf("current version %d, upload said %v", region.Version, result["version"])
	}

	// KEEP_VERSIONS=2: a third upload prunes the first version.
	upload(t, srv, fixture, "tiny")
	if rows, _ := st.Weekly(context.Background(), 1, store.WeeklyFilter{}); len(rows) != 0 {
		t.Fatalf("version 1 should be pruned, still has %d rows", len(rows))
	}

	req, _ := http.NewRequest("DELETE", srv.URL+"/v1/regions/tiny", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := srv.Client().Do(req)
	if err != nil || resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: %v %v", err, resp.Status)
	}
	if resp, _ := get(t, srv, path); resp.StatusCode != 404 {
		t.Fatalf("after delete: %d", resp.StatusCode)
	}
	if _, body := get(t, srv, "/v1/regions"); string(body) != "[]" {
		t.Fatalf("index after delete: %s", body)
	}
}

func TestInvalidUploadChangesNothing(t *testing.T) {
	srv, st := newServer(t)
	bad := t.TempDir()
	for _, file := range []string{"metadata.json", "areas.geojson", "weekly_activity.json", "hotspots.geojson"} {
		data, _ := os.ReadFile(filepath.Join(fixture, file))
		if file == "hotspots.geojson" {
			data = []byte(strings.Replace(string(data), `"platform":"NOAA-20"`, `"platform":"GOES-16"`, 1))
		}
		os.WriteFile(filepath.Join(bad, file), data, 0o644)
	}
	result, err := push.Push(context.Background(), srv.Client(), srv.URL, token, bad, "tiny")
	if err == nil || !strings.Contains(err.Error(), "422") || !strings.Contains(strings.Join(toStrings(result["details"]), " "), "GOES-16") {
		t.Fatalf("expected 422 listing the bad platform, got %v %v", err, result)
	}
	if _, err := st.Region(context.Background(), "tiny"); err != store.ErrNotFound {
		t.Fatalf("rejected upload must not create the region: %v", err)
	}
}

func toStrings(v any) []string {
	var out []string
	for _, item := range v.([]any) {
		out = append(out, item.(string))
	}
	return out
}
