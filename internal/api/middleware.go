package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"log/slog"
	"net/http"
	"slices"
	"time"
)

type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += n
	return n, err
}

// withLogging adds X-Request-ID, recovers panics and logs one line per request.
func withLogging(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			buf := make([]byte, 8)
			rand.Read(buf)
			id = hex.EncodeToString(buf)
		}
		w.Header().Set("X-Request-ID", id)
		sw := &statusWriter{ResponseWriter: w}
		start := time.Now()
		defer func() {
			if recovered := recover(); recovered != nil {
				log.Error("panic", "request_id", id, "error", recovered)
				if sw.status == 0 {
					writeError(sw, http.StatusInternalServerError, "internal error")
				}
			}
			log.Info("request", "request_id", id, "method", r.Method, "path", r.URL.Path, "query", r.URL.RawQuery,
				"status", sw.status, "bytes", sw.bytes, "cache", sw.Header().Get("X-Cache"),
				"duration_ms", time.Since(start).Milliseconds())
		}()
		next.ServeHTTP(sw, r)
	})
}

// withCORS lets browsers on the listed origins read the API ("*" allows any).
func withCORS(origins []string, next http.Handler) http.Handler {
	allowAll := slices.Contains(origins, "*")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (allowAll || slices.Contains(origins, origin)) {
			h := w.Header()
			if allowAll {
				h.Set("Access-Control-Allow-Origin", "*")
			} else {
				h.Set("Access-Control-Allow-Origin", origin)
				h.Add("Vary", "Origin")
			}
			h.Set("Access-Control-Expose-Headers", "ETag, X-Cache, X-Truncated, X-Request-ID")
			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", "GET, HEAD, PUT, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-None-Match")
				h.Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// requireToken guards write routes with "Authorization: Bearer <API_TOKEN>".
func requireToken(token string, next http.HandlerFunc) http.HandlerFunc {
	expected := []byte("Bearer " + token)
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if token == "" {
			writeError(w, http.StatusServiceUnavailable, "writes are disabled: API_TOKEN is not set on the server")
			return
		}
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), expected) != 1 {
			w.Header().Set("WWW-Authenticate", `Bearer realm="llama-api"`)
			writeError(w, http.StatusUnauthorized, "missing or invalid bearer token")
			return
		}
		next(w, r)
	}
}
