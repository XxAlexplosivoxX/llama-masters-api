// Package cache keeps ready-to-send responses in memory and answers HTTP
// revalidation (ETag / If-None-Match) and gzip negotiation for them.
package cache

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"golang.org/x/sync/singleflight"
)

// Bodies smaller than this are sent uncompressed: gzip would not pay off.
const minGzipBytes = 1024

// Entry is a complete response: body, optional gzip copy, ETag and headers.
type Entry struct {
	Body        []byte
	Gzip        []byte
	ETag        string
	ContentType string
	Header      http.Header // extra headers, e.g. X-Truncated
}

func NewEntry(body []byte, contentType string, header http.Header) *Entry {
	sum := sha256.Sum256(body)
	e := &Entry{Body: body, ETag: `"` + hex.EncodeToString(sum[:12]) + `"`, ContentType: contentType, Header: header}
	if len(body) >= minGzipBytes {
		var buf bytes.Buffer
		zw, _ := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
		zw.Write(body)
		zw.Close()
		e.Gzip = buf.Bytes()
	}
	return e
}

type Cache struct {
	lru          *expirable.LRU[string, *Entry]
	group        singleflight.Group
	maxItemBytes int
	hits, misses atomic.Int64
}

// New caches up to maxEntries responses for ttl; bodies above maxItemBytes are
// served but never stored.
func New(maxEntries int, ttl time.Duration, maxItemBytes int) *Cache {
	return &Cache{lru: expirable.NewLRU[string, *Entry](maxEntries, nil, ttl), maxItemBytes: maxItemBytes}
}

// Get returns the entry for key, building it once even under concurrent misses.
func (c *Cache) Get(key string, build func() (*Entry, error)) (*Entry, bool, error) {
	if e, ok := c.lru.Get(key); ok {
		c.hits.Add(1)
		return e, true, nil
	}
	c.misses.Add(1)
	value, err, _ := c.group.Do(key, func() (any, error) {
		if e, ok := c.lru.Get(key); ok {
			return e, nil
		}
		e, err := build()
		if err != nil {
			return nil, err
		}
		if len(e.Body) <= c.maxItemBytes {
			c.lru.Add(key, e)
		}
		return e, nil
	})
	if err != nil {
		return nil, false, err
	}
	return value.(*Entry), false, nil
}

// PurgePrefix drops every key starting with prefix (e.g. one region's responses).
func (c *Cache) PurgePrefix(prefix string) int {
	removed := 0
	for _, key := range c.lru.Keys() {
		if strings.HasPrefix(key, prefix) && c.lru.Remove(key) {
			removed++
		}
	}
	return removed
}

type Stats struct {
	Hits    int64 `json:"hits"`
	Misses  int64 `json:"misses"`
	Entries int   `json:"entries"`
}

func (c *Cache) Stats() Stats {
	return Stats{Hits: c.hits.Load(), Misses: c.misses.Load(), Entries: c.lru.Len()}
}

// Serve writes e, answering 304 when the client already has it and gzip when accepted.
func Serve(w http.ResponseWriter, r *http.Request, e *Entry, hit bool, cacheControl string) {
	h := w.Header()
	for name, values := range e.Header {
		h[name] = values
	}
	h.Set("ETag", e.ETag)
	h.Set("Cache-Control", cacheControl)
	h.Set("Vary", "Accept-Encoding")
	if hit {
		h.Set("X-Cache", "HIT")
	} else {
		h.Set("X-Cache", "MISS")
	}
	if matches(r.Header.Get("If-None-Match"), e.ETag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	h.Set("Content-Type", e.ContentType)
	body := e.Body
	if e.Gzip != nil && acceptsGzip(r) {
		h.Set("Content-Encoding", "gzip")
		body = e.Gzip
	}
	h.Set("Content-Length", strconv.Itoa(len(body)))
	if r.Method != http.MethodHead {
		w.Write(body)
	}
}

func matches(ifNoneMatch, etag string) bool {
	for _, candidate := range strings.Split(ifNoneMatch, ",") {
		candidate = strings.TrimPrefix(strings.TrimSpace(candidate), "W/")
		if candidate == etag || candidate == "*" {
			return true
		}
	}
	return false
}

func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if strings.TrimSpace(name) != "gzip" {
			continue
		}
		q := 1.0
		if value, ok := strings.CutPrefix(strings.TrimSpace(params), "q="); ok {
			q, _ = strconv.ParseFloat(value, 64)
		}
		return q > 0
	}
	return false
}
