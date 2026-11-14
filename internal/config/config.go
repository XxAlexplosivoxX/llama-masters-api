// Package config reads settings from the environment (mise loads .env in development).
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr                string
	DBPath              string
	APIToken            string // empty disables write routes
	CORSOrigins         []string
	CacheMaxEntries     int
	CacheTTL            time.Duration
	CacheMaxItemBytes   int
	CacheHTTPMaxAge     time.Duration
	MaxUploadBytes      int64
	KeepVersions        int
	HotspotLimitDefault int
	HotspotLimitMax     int
}

func Load() (Config, error) {
	var errs []string
	str := func(name, fallback string) string {
		if value, ok := os.LookupEnv(name); ok && value != "" {
			return value
		}
		return fallback
	}
	integer := func(name string, fallback int) int {
		value, err := strconv.Atoi(str(name, strconv.Itoa(fallback)))
		if err != nil || value < 0 {
			errs = append(errs, name+" must be a non-negative integer")
		}
		return value
	}
	duration := func(name string, fallback time.Duration) time.Duration {
		value, err := time.ParseDuration(str(name, fallback.String()))
		if err != nil || value < 0 {
			errs = append(errs, name+" must be a duration such as 90s or 10m")
		}
		return value
	}
	cfg := Config{
		Addr:                str("ADDR", ":8080"),
		DBPath:              str("DB_PATH", "data/llama.db"),
		APIToken:            os.Getenv("API_TOKEN"),
		CacheMaxEntries:     integer("CACHE_MAX_ENTRIES", 256),
		CacheTTL:            duration("CACHE_TTL", 10*time.Minute),
		CacheMaxItemBytes:   integer("CACHE_MAX_ITEM_MB", 64) << 20,
		CacheHTTPMaxAge:     duration("CACHE_HTTP_MAX_AGE", time.Minute),
		MaxUploadBytes:      int64(integer("MAX_UPLOAD_MB", 256)) << 20,
		KeepVersions:        integer("KEEP_VERSIONS", 2),
		HotspotLimitDefault: integer("HOTSPOT_LIMIT_DEFAULT", 50_000),
		HotspotLimitMax:     integer("HOTSPOT_LIMIT_MAX", 200_000),
	}
	for _, origin := range strings.Split(str("CORS_ORIGINS", "*"), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			cfg.CORSOrigins = append(cfg.CORSOrigins, origin)
		}
	}
	if cfg.CacheMaxEntries == 0 {
		errs = append(errs, "CACHE_MAX_ENTRIES must be at least 1")
	}
	if cfg.KeepVersions == 0 {
		errs = append(errs, "KEEP_VERSIONS must be at least 1")
	}
	if cfg.HotspotLimitDefault > cfg.HotspotLimitMax {
		errs = append(errs, "HOTSPOT_LIMIT_DEFAULT must not exceed HOTSPOT_LIMIT_MAX")
	}
	if len(errs) > 0 {
		return cfg, fmt.Errorf("invalid configuration: %s", strings.Join(errs, "; "))
	}
	return cfg, nil
}
