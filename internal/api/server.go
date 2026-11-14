// Package api serves uploaded region exports over HTTP with response caching.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/XxAlexplosivoxX/llama-masters-api/internal/cache"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/config"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/contract"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/store"
)

const (
	contentJSON    = "application/json"
	contentGeoJSON = "application/geo+json"
	// Cache keys for responses that span every region start with this prefix.
	allRegionsKey = "*@"
)

type Server struct {
	cfg          config.Config
	store        *store.Store
	cache        *cache.Cache
	log          *slog.Logger
	cacheControl string
}

func New(cfg config.Config, st *store.Store, c *cache.Cache, log *slog.Logger) http.Handler {
	s := &Server{cfg: cfg, store: st, cache: c, log: log,
		cacheControl: fmt.Sprintf("public, max-age=%d, stale-while-revalidate=%d",
			int(cfg.CacheHTTPMaxAge.Seconds()), int(5*cfg.CacheHTTPMaxAge.Seconds()))}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /debug/cache", s.cacheStats)

	mux.HandleFunc("GET /v1/regions", s.listRegions)
	mux.HandleFunc("GET /v1/regions/{name}", s.regionInfo)
	mux.HandleFunc("GET /v1/regions/{name}/areas", s.areas)
	mux.HandleFunc("GET /v1/regions/{name}/weekly", s.weekly)
	mux.HandleFunc("GET /v1/regions/{name}/hotspots", s.hotspots)
	mux.HandleFunc("PUT /v1/regions/{name}", requireToken(cfg.APIToken, s.upload))
	mux.HandleFunc("DELETE /v1/regions/{name}", requireToken(cfg.APIToken, s.deleteRegion))

	// Same paths as llama-masters-research's data/processed/, so its app can use the
	// API by changing only its data base URL.
	mux.HandleFunc("GET /index.json", s.listRegions)
	mux.HandleFunc("GET /{name}/{file}", s.compatFile)
	return withLogging(log, withCORS(cfg.CORSOrigins, mux))
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", contentJSON)
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "writes_enabled": s.cfg.APIToken != ""})
}

func (s *Server) cacheStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, s.cache.Stats())
}

// respond serves a cached response for key, building it with build on a miss.
func (s *Server) respond(w http.ResponseWriter, r *http.Request, key string, build func() (*cache.Entry, error)) {
	entry, hit, err := s.cache.Get(key, build)
	if err != nil {
		var bad badRequest
		if errors.As(err, &bad) {
			writeError(w, http.StatusBadRequest, string(bad))
			return
		}
		s.log.Error("building response", "key", key, "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	cache.Serve(w, r, entry, hit, s.cacheControl)
}

type badRequest string

func (b badRequest) Error() string { return string(b) }

func jsonEntry(value any, contentType string, header http.Header) (*cache.Entry, error) {
	body, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return cache.NewEntry(body, contentType, header), nil
}

// region loads the current version of the {name} region, writing 404 if it is unknown.
func (s *Server) region(w http.ResponseWriter, r *http.Request) (store.Region, bool) {
	name := r.PathValue("name")
	region, err := s.store.Region(r.Context(), name)
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, fmt.Sprintf("unknown region %q", name))
		return region, false
	case err != nil:
		s.log.Error("loading region", "region", name, "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return region, false
	}
	return region, true
}

// key identifies a response: the region version changes on every upload, so old
// entries can never be served for new data.
func key(region store.Region, r *http.Request) string {
	return fmt.Sprintf("%s@%d %s?%s", region.Name, region.Version, r.URL.Path, r.URL.Query().Encode())
}

func (s *Server) listRegions(w http.ResponseWriter, r *http.Request) {
	s.respond(w, r, allRegionsKey+" "+r.URL.Path, func() (*cache.Entry, error) {
		index, err := s.store.Index(r.Context())
		if err != nil {
			return nil, err
		}
		return jsonEntry(index, contentJSON, nil)
	})
}

func (s *Server) regionInfo(w http.ResponseWriter, r *http.Request) {
	region, ok := s.region(w, r)
	if !ok {
		return
	}
	s.respond(w, r, key(region, r), func() (*cache.Entry, error) { return jsonEntry(region, contentJSON, nil) })
}

type feature struct {
	Type       string          `json:"type"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties any             `json:"properties"`
}

type featureCollection struct {
	Type     string    `json:"type"`
	Features []feature `json:"features"`
}

func (s *Server) areas(w http.ResponseWriter, r *http.Request) {
	region, ok := s.region(w, r)
	if !ok {
		return
	}
	s.respond(w, r, key(region, r), func() (*cache.Entry, error) { return s.areasEntry(r.Context(), region) })
}

func (s *Server) areasEntry(ctx context.Context, region store.Region) (*cache.Entry, error) {
	areas, err := s.store.Areas(ctx, region.Version)
	if err != nil {
		return nil, err
	}
	fc := featureCollection{Type: "FeatureCollection", Features: make([]feature, len(areas))}
	for i, a := range areas {
		fc.Features[i] = feature{Type: "Feature", Geometry: a.Geometry,
			Properties: map[string]string{"area_id": a.ID, "name": a.Name}}
	}
	return jsonEntry(fc, contentGeoJSON, nil)
}

func (s *Server) weekly(w http.ResponseWriter, r *http.Request) {
	region, ok := s.region(w, r)
	if !ok {
		return
	}
	s.respond(w, r, key(region, r), func() (*cache.Entry, error) {
		q := r.URL.Query()
		filter := store.WeeklyFilter{AreaID: q.Get("area_id"), Platform: q.Get("platform"), From: q.Get("from"), To: q.Get("to")}
		if err := checkPlatform(filter.Platform); err != nil {
			return nil, err
		}
		if err := checkDates(filter.From, filter.To); err != nil {
			return nil, err
		}
		rows, err := s.store.Weekly(r.Context(), region.Version, filter)
		if err != nil {
			return nil, err
		}
		return jsonEntry(rows, contentJSON, nil)
	})
}

func (s *Server) hotspots(w http.ResponseWriter, r *http.Request) {
	region, ok := s.region(w, r)
	if !ok {
		return
	}
	s.respond(w, r, key(region, r), func() (*cache.Entry, error) {
		filter, err := s.hotspotFilter(r)
		if err != nil {
			return nil, err
		}
		return s.hotspotsEntry(r.Context(), region, filter)
	})
}

func (s *Server) hotspotFilter(r *http.Request) (store.HotspotFilter, error) {
	q := r.URL.Query()
	f := store.HotspotFilter{Platform: q.Get("platform"), Day: q.Get("day"), From: q.Get("from"), To: q.Get("to"),
		AreaID: q.Get("area_id"), Limit: s.cfg.HotspotLimitDefault, Newest: true}
	if err := checkPlatform(f.Platform); err != nil {
		return f, err
	}
	if err := checkDates(f.Day, f.From, f.To); err != nil {
		return f, err
	}
	if raw := q.Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > s.cfg.HotspotLimitMax {
			return f, badRequest(fmt.Sprintf("limit must be between 1 and %d", s.cfg.HotspotLimitMax))
		}
		f.Limit = limit
	}
	if raw := q.Get("bbox"); raw != "" {
		parts := strings.Split(raw, ",")
		var box [4]float64
		valid := len(parts) == 4
		for i := 0; valid && i < 4; i++ {
			var err error
			box[i], err = strconv.ParseFloat(strings.TrimSpace(parts[i]), 64)
			valid = err == nil
		}
		if !valid || box[0] >= box[2] || box[1] >= box[3] || box[0] < -180 || box[2] > 180 || box[1] < -90 || box[3] > 90 {
			return f, badRequest("bbox must be west,south,east,north with west < east and south < north")
		}
		f.BBox = &box
	}
	return f, nil
}

func (s *Server) hotspotsEntry(ctx context.Context, region store.Region, f store.HotspotFilter) (*cache.Entry, error) {
	points, truncated, err := s.store.Hotspots(ctx, region.Version, f)
	if err != nil {
		return nil, err
	}
	fc := featureCollection{Type: "FeatureCollection", Features: make([]feature, len(points))}
	for i, h := range points {
		fc.Features[i] = feature{Type: "Feature",
			Geometry: json.RawMessage(fmt.Sprintf(`{"type":"Point","coordinates":[%s,%s]}`,
				strconv.FormatFloat(h.Lon, 'f', -1, 64), strconv.FormatFloat(h.Lat, 'f', -1, 64))),
			Properties: hotspotProperties{AcquiredUTC: h.AcquiredUTC, Platform: h.Platform, Confidence: h.Confidence,
				FRP: h.FRP, DayNight: h.DayNight, Processing: h.Processing, AreaIDs: h.AreaIDs}}
	}
	header := http.Header{"X-Truncated": {strconv.FormatBool(truncated)}}
	return jsonEntry(fc, contentGeoJSON, header)
}

// hotspotProperties keeps the property order of the research repo's hotspots.geojson.
type hotspotProperties struct {
	AcquiredUTC string   `json:"acquired_utc"`
	Platform    string   `json:"platform"`
	Confidence  string   `json:"confidence"`
	FRP         float64  `json:"frp"`
	DayNight    string   `json:"daynight"`
	Processing  string   `json:"processing"`
	AreaIDs     []string `json:"area_ids"`
}

// compatFile serves /{name}/{file} with the exact files the research repo writes.
func (s *Server) compatFile(w http.ResponseWriter, r *http.Request) {
	file := r.PathValue("file")
	switch file {
	case "metadata.json", "areas.geojson", "weekly_activity.json", "hotspots.geojson":
	default:
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	region, ok := s.region(w, r)
	if !ok {
		return
	}
	s.respond(w, r, key(region, r), func() (*cache.Entry, error) {
		switch file {
		case "metadata.json":
			return cache.NewEntry(region.Metadata, contentJSON, nil), nil
		case "areas.geojson":
			return s.areasEntry(r.Context(), region)
		case "weekly_activity.json":
			rows, err := s.store.Weekly(r.Context(), region.Version, store.WeeklyFilter{})
			if err != nil {
				return nil, err
			}
			return jsonEntry(rows, contentJSON, nil)
		default: // hotspots.geojson: every point, in upload order
			return s.hotspotsEntry(r.Context(), region, store.HotspotFilter{})
		}
	})
}

func checkPlatform(platform string) error {
	if _, ok := contract.Platforms[platform]; platform != "" && !ok {
		return badRequest(fmt.Sprintf("unknown platform %q (use Terra, Aqua, S-NPP, NOAA-20 or NOAA-21)", platform))
	}
	return nil
}

func checkDates(values ...string) error {
	for _, value := range values {
		if value != "" && !contract.ValidDate(value) {
			return badRequest(fmt.Sprintf("invalid date %q, expected YYYY-MM-DD", value))
		}
	}
	return nil
}
