package cache

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestHitMissAndSingleflight(t *testing.T) {
	c := New(10, time.Minute, 1<<20)
	var builds atomic.Int32
	build := func() (*Entry, error) {
		builds.Add(1)
		time.Sleep(20 * time.Millisecond)
		return NewEntry([]byte(`{"ok":true}`), "application/json", nil), nil
	}
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() { defer wg.Done(); c.Get("k", build) }()
	}
	wg.Wait()
	if builds.Load() != 1 {
		t.Fatalf("concurrent misses built %d times, want 1", builds.Load())
	}
	if _, hit, _ := c.Get("k", build); !hit {
		t.Fatal("second get should hit")
	}
}

func TestOversizedNotStoredAndPurge(t *testing.T) {
	c := New(10, time.Minute, 4)
	big := func() (*Entry, error) { return NewEntry([]byte("0123456789"), "text/plain", nil), nil }
	c.Get("big", big)
	if _, hit, _ := c.Get("big", big); hit {
		t.Fatal("bodies above the item limit must not be cached")
	}
	small := func() (*Entry, error) { return NewEntry([]byte("ok"), "text/plain", nil), nil }
	c.Get("region@1 /a", small)
	c.Get("region@1 /b", small)
	c.Get("other@1 /a", small)
	if removed := c.PurgePrefix("region@"); removed != 2 || c.Stats().Entries != 1 {
		t.Fatalf("purged %d, %d entries left", removed, c.Stats().Entries)
	}
}

func TestServeETagAndGzip(t *testing.T) {
	body := []byte(strings.Repeat(`{"point":[1,2]},`, 200))
	e := NewEntry(body, "application/json", http.Header{"X-Truncated": {"false"}})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Accept-Encoding", "br, gzip;q=0.8")
	Serve(rec, req, e, false, "public, max-age=60")
	if rec.Header().Get("Content-Encoding") != "gzip" || rec.Header().Get("X-Cache") != "MISS" ||
		rec.Header().Get("X-Truncated") != "false" {
		t.Fatalf("headers: %v", rec.Header())
	}
	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	if plain, _ := io.ReadAll(zr); !bytes.Equal(plain, body) {
		t.Fatal("gzip body differs")
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("If-None-Match", `W/"other", `+e.ETag)
	Serve(rec, req, e, true, "public, max-age=60")
	if rec.Code != http.StatusNotModified || rec.Body.Len() != 0 {
		t.Fatalf("If-None-Match: status %d, %d bytes", rec.Code, rec.Body.Len())
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Accept-Encoding", "gzip;q=0")
	Serve(rec, req, e, true, "")
	if rec.Header().Get("Content-Encoding") != "" || !bytes.Equal(rec.Body.Bytes(), body) {
		t.Fatal("gzip;q=0 must get the plain body")
	}
}
