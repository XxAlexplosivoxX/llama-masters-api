// Package store keeps uploaded region versions in SQLite (pure-Go driver, no cgo).
package store

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"github.com/XxAlexplosivoxX/llama-masters-api/internal/contract"
)

//go:embed migrations/*.sql
var migrations embed.FS

var ErrNotFound = errors.New("not found")

// Store wraps the database. Writes are serialized with a mutex because SQLite allows
// one writer; WAL mode lets reads continue during an upload.
type Store struct {
	db      *sql.DB
	writeMu sync.Mutex
}

func Open(path string) (*Store, error) {
	dsn := "file:" + path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(8)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error                   { return s.db.Close() }
func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *Store) migrate() error {
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)`); err != nil {
		return err
	}
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		var done int
		if err := s.db.QueryRow(`SELECT count(*) FROM schema_migrations WHERE version = ?`, name).Scan(&done); err != nil {
			return err
		}
		if done > 0 {
			continue
		}
		script, err := migrations.ReadFile(name)
		if err != nil {
			return err
		}
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(script)); err != nil {
			tx.Rollback()
			return fmt.Errorf("%s: %w", name, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, name); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// Upload is an in-progress region version. Hotspots are added one by one while the
// request body streams in; nothing is visible to readers until Commit.
type Upload struct {
	store      *Store
	tx         *sql.Tx
	region     string
	versionID  int64
	hotspot    *sql.Stmt
	membership *sql.Stmt
	hotspots   int
	done       bool
}

func (s *Store) BeginUpload(ctx context.Context, region string, meta contract.Metadata,
	areas []contract.Area, weekly []contract.WeeklyRow) (*Upload, error) {
	s.writeMu.Lock()
	u := &Upload{store: s, region: region}
	fail := func(err error) (*Upload, error) {
		u.Rollback()
		return nil, err
	}
	var err error
	if u.tx, err = s.db.BeginTx(ctx, nil); err != nil {
		s.writeMu.Unlock()
		return nil, err
	}
	result, err := u.tx.Exec(`INSERT INTO versions (region, created_at, metadata_json, start_date, end_date)
		VALUES (?, ?, ?, ?, ?)`, region, now(), string(meta.Raw), meta.Start, meta.End)
	if err != nil {
		return fail(err)
	}
	if u.versionID, err = result.LastInsertId(); err != nil {
		return fail(err)
	}
	for i, a := range areas {
		if _, err := u.tx.Exec(`INSERT INTO areas (version_id, area_id, ord, name, geometry_json, min_lon, min_lat, max_lon, max_lat)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, u.versionID, a.ID, i, a.Name, string(a.Geometry),
			a.MinLon, a.MinLat, a.MaxLon, a.MaxLat); err != nil {
			return fail(err)
		}
	}
	weeklyStmt, err := u.tx.Prepare(`INSERT INTO weekly (version_id, area_id, platform, instrument, iso_week, week_start,
		week_end, reported_detections, source_days, source_complete, week_complete, observation_coverage)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fail(err)
	}
	defer weeklyStmt.Close()
	for _, w := range weekly {
		if _, err := weeklyStmt.Exec(u.versionID, w.AreaID, w.Platform, w.Instrument, w.ISOWeek, w.WeekStart, w.WeekEnd,
			w.ReportedDetections, w.SourceDays, w.SourceComplete, w.WeekComplete, w.ObservationCoverage); err != nil {
			return fail(err)
		}
	}
	if u.hotspot, err = u.tx.Prepare(`INSERT INTO hotspots (version_id, lon, lat, acquired_utc, day, platform,
		confidence, frp, daynight, processing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`); err != nil {
		return fail(err)
	}
	if u.membership, err = u.tx.Prepare(`INSERT INTO hotspot_areas (hotspot_id, area_id) VALUES (?, ?)`); err != nil {
		return fail(err)
	}
	return u, nil
}

func (u *Upload) AddHotspot(h contract.Hotspot) error {
	result, err := u.hotspot.Exec(u.versionID, h.Lon, h.Lat, h.AcquiredUTC, h.Day, h.Platform, h.Confidence, h.FRP,
		h.DayNight, h.Processing)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	for _, area := range h.AreaIDs {
		if _, err := u.membership.Exec(id, area); err != nil {
			return err
		}
	}
	u.hotspots++
	return nil
}

// Commit makes the upload the region's current version and prunes versions beyond keep.
func (u *Upload) Commit(sha256 string, keep int) (int64, error) {
	defer u.finish()
	if _, err := u.tx.Exec(`UPDATE versions SET sha256 = ?, hotspot_count = ? WHERE id = ?`,
		sha256, u.hotspots, u.versionID); err != nil {
		return 0, err
	}
	if _, err := u.tx.Exec(`INSERT INTO regions (name, current_version, updated_at) VALUES (?, ?, ?)
		ON CONFLICT (name) DO UPDATE SET current_version = excluded.current_version, updated_at = excluded.updated_at`,
		u.region, u.versionID, now()); err != nil {
		return 0, err
	}
	if _, err := u.tx.Exec(`DELETE FROM versions WHERE region = ? AND id NOT IN
		(SELECT id FROM versions WHERE region = ? ORDER BY id DESC LIMIT ?)`, u.region, u.region, max(keep, 1)); err != nil {
		return 0, err
	}
	if err := u.tx.Commit(); err != nil {
		return 0, err
	}
	return u.versionID, nil
}

// Rollback discards the upload; it is safe to call after Commit.
func (u *Upload) Rollback() {
	if u.done {
		return
	}
	if u.tx != nil {
		u.tx.Rollback()
	}
	u.finish()
}

func (u *Upload) finish() {
	if u.done {
		return
	}
	u.done = true
	for _, stmt := range []*sql.Stmt{u.hotspot, u.membership} {
		if stmt != nil {
			stmt.Close()
		}
	}
	u.store.writeMu.Unlock()
}

func (s *Store) DeleteRegion(ctx context.Context, name string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.Exec(`DELETE FROM regions WHERE name = ?`, name)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec(`DELETE FROM versions WHERE region = ?`, name); err != nil {
		return err
	}
	return tx.Commit()
}

// Region is the current version of one region.
type Region struct {
	Name         string          `json:"name"`
	Version      int64           `json:"version"`
	UploadedAt   string          `json:"uploaded_at"`
	SHA256       string          `json:"sha256"`
	Start        string          `json:"start"`
	End          string          `json:"end"`
	HotspotCount int             `json:"hotspot_count"`
	Metadata     json.RawMessage `json:"metadata"`
}

func (s *Store) Region(ctx context.Context, name string) (Region, error) {
	r := Region{Name: name}
	var metadata string
	err := s.db.QueryRowContext(ctx, `SELECT v.id, v.created_at, v.sha256, v.start_date, v.end_date, v.hotspot_count,
		v.metadata_json FROM regions r JOIN versions v ON v.id = r.current_version WHERE r.name = ?`, name).
		Scan(&r.Version, &r.UploadedAt, &r.SHA256, &r.Start, &r.End, &r.HotspotCount, &metadata)
	if errors.Is(err, sql.ErrNoRows) {
		return r, ErrNotFound
	}
	r.Metadata = json.RawMessage(metadata)
	return r, err
}

// IndexEntry matches data/processed/index.json from the research repo, plus the version.
type IndexEntry struct {
	Name      string                 `json:"name"`
	Version   int64                  `json:"version"`
	Start     string                 `json:"start"`
	End       string                 `json:"end"`
	Platforms []string               `json:"platforms"`
	Areas     int                    `json:"areas"`
	Hotspots  contract.HotspotWindow `json:"hotspots"`
}

func (s *Store) Index(ctx context.Context) ([]IndexEntry, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT r.name, v.id, v.start_date, v.end_date, v.hotspot_count, v.metadata_json,
		(SELECT count(*) FROM areas a WHERE a.version_id = v.id),
		(SELECT coalesce(group_concat(platform, ','), '') FROM (SELECT DISTINCT platform FROM weekly w
			WHERE w.version_id = v.id ORDER BY platform))
		FROM regions r JOIN versions v ON v.id = r.current_version ORDER BY r.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []IndexEntry{}
	for rows.Next() {
		var e IndexEntry
		var metadata, platforms string
		if err := rows.Scan(&e.Name, &e.Version, &e.Start, &e.End, &e.Hotspots.Features, &metadata, &e.Areas,
			&platforms); err != nil {
			return nil, err
		}
		var parsed struct {
			Hotspots *contract.HotspotWindow `json:"hotspots"`
		}
		if json.Unmarshal([]byte(metadata), &parsed) == nil && parsed.Hotspots != nil {
			e.Hotspots.FirstDay, e.Hotspots.LastDay = parsed.Hotspots.FirstDay, parsed.Hotspots.LastDay
		}
		e.Platforms = []string{}
		if platforms != "" {
			e.Platforms = strings.Split(platforms, ",")
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// AreaRow is one stored area, in upload order.
type AreaRow struct {
	ID       string
	Name     string
	Geometry json.RawMessage
}

func (s *Store) Areas(ctx context.Context, version int64) ([]AreaRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT area_id, name, geometry_json FROM areas WHERE version_id = ? ORDER BY ord`, version)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var areas []AreaRow
	for rows.Next() {
		var a AreaRow
		var geometry string
		if err := rows.Scan(&a.ID, &a.Name, &geometry); err != nil {
			return nil, err
		}
		a.Geometry = json.RawMessage(geometry)
		areas = append(areas, a)
	}
	return areas, rows.Err()
}

// WeeklyFilter narrows weekly rows; empty fields match everything. From/To bound week_start.
type WeeklyFilter struct {
	AreaID, Platform, From, To string
}

func (s *Store) Weekly(ctx context.Context, version int64, f WeeklyFilter) ([]contract.WeeklyRow, error) {
	query := `SELECT area_id, week_start, week_end, iso_week, instrument, platform, reported_detections, source_days,
		source_complete, week_complete, observation_coverage FROM weekly WHERE version_id = ?`
	args := []any{version}
	for _, c := range []struct{ clause, value string }{
		{" AND area_id = ?", f.AreaID}, {" AND platform = ?", f.Platform},
		{" AND week_start >= ?", f.From}, {" AND week_start <= ?", f.To},
	} {
		if c.value != "" {
			query += c.clause
			args = append(args, c.value)
		}
	}
	rows, err := s.db.QueryContext(ctx, query+" ORDER BY rowid", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []contract.WeeklyRow{}
	for rows.Next() {
		var w contract.WeeklyRow
		var detections sql.NullInt64
		if err := rows.Scan(&w.AreaID, &w.WeekStart, &w.WeekEnd, &w.ISOWeek, &w.Instrument, &w.Platform, &detections,
			&w.SourceDays, &w.SourceComplete, &w.WeekComplete, &w.ObservationCoverage); err != nil {
			return nil, err
		}
		if detections.Valid {
			value := int(detections.Int64)
			w.ReportedDetections = &value
		}
		result = append(result, w)
	}
	return result, rows.Err()
}

// HotspotFilter narrows hotspots; empty fields match everything. Limit 0 means no limit.
// Newest orders by acquisition time descending; otherwise upload order is kept.
type HotspotFilter struct {
	Platform, Day, From, To, AreaID string
	BBox                            *[4]float64 // west, south, east, north
	Limit                           int
	Newest                          bool
}

func (s *Store) Hotspots(ctx context.Context, version int64, f HotspotFilter) ([]contract.Hotspot, bool, error) {
	query := `SELECT h.lon, h.lat, h.acquired_utc, h.day, h.platform, h.confidence, h.frp, h.daynight, h.processing,
		(SELECT coalesce(group_concat(area_id, char(31)), '') FROM hotspot_areas ha WHERE ha.hotspot_id = h.id)
		FROM hotspots h`
	args := []any{}
	if f.AreaID != "" {
		query += ` JOIN hotspot_areas sel ON sel.hotspot_id = h.id AND sel.area_id = ?`
		args = append(args, f.AreaID)
	}
	query += ` WHERE h.version_id = ?`
	args = append(args, version)
	for _, c := range []struct{ clause, value string }{
		{" AND h.platform = ?", f.Platform}, {" AND h.day = ?", f.Day},
		{" AND h.day >= ?", f.From}, {" AND h.day <= ?", f.To},
	} {
		if c.value != "" {
			query += c.clause
			args = append(args, c.value)
		}
	}
	if f.BBox != nil {
		query += ` AND h.lon BETWEEN ? AND ? AND h.lat BETWEEN ? AND ?`
		args = append(args, f.BBox[0], f.BBox[2], f.BBox[1], f.BBox[3])
	}
	if f.Newest {
		query += ` ORDER BY h.acquired_utc DESC, h.id`
	} else {
		query += ` ORDER BY h.id`
	}
	if f.Limit > 0 {
		query += ` LIMIT ?`
		args = append(args, f.Limit+1) // one extra row tells us the result was truncated
	}
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	result := []contract.Hotspot{}
	for rows.Next() {
		var h contract.Hotspot
		var areas string
		if err := rows.Scan(&h.Lon, &h.Lat, &h.AcquiredUTC, &h.Day, &h.Platform, &h.Confidence, &h.FRP, &h.DayNight,
			&h.Processing, &areas); err != nil {
			return nil, false, err
		}
		h.AreaIDs = []string{}
		if areas != "" {
			h.AreaIDs = strings.Split(areas, "\x1f")
		}
		result = append(result, h)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	truncated := f.Limit > 0 && len(result) > f.Limit
	if truncated {
		result = result[:f.Limit]
	}
	return result, truncated, nil
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }
