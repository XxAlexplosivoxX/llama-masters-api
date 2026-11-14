// Package contract mirrors the region exports written by llama-masters-research's
// scripts/prepare_region.py (documented in its data/README.md#app-exports) and
// validates them before they are stored.
package contract

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"
)

// Platforms maps each supported platform to its instrument.
var Platforms = map[string]string{
	"Terra": "MODIS", "Aqua": "MODIS", "S-NPP": "VIIRS", "NOAA-20": "VIIRS", "NOAA-21": "VIIRS",
}

const (
	dateLayout     = "2006-01-02"
	acquiredLayout = "2006-01-02T15:04Z"
	maxErrors      = 50
)

var namePattern = regexp.MustCompile(`^[a-z0-9_-]+$`)

// ValidName reports whether name is usable as a region name (same rule as download_region.py).
func ValidName(name string) bool { return namePattern.MatchString(name) }

// ValidDate reports whether s is a YYYY-MM-DD date.
func ValidDate(s string) bool {
	_, err := time.Parse(dateLayout, s)
	return err == nil
}

// Errors collects every validation problem in an upload so clients can fix them at once.
type Errors []string

func (e Errors) Error() string { return strings.Join(e, "; ") }

func (e *Errors) add(format string, args ...any) {
	if len(*e) < maxErrors {
		*e = append(*e, fmt.Sprintf(format, args...))
	}
}

func (e Errors) err() error {
	if len(e) == 0 {
		return nil
	}
	return e
}

// AsErrors returns the validation errors in err, if any.
func AsErrors(err error) (Errors, bool) {
	var errs Errors
	ok := errors.As(err, &errs)
	return errs, ok
}

// Metadata keeps the uploaded metadata.json verbatim plus the fields the API indexes.
type Metadata struct {
	Raw      json.RawMessage
	Start    string
	End      string
	Hotspots *HotspotWindow
}

// HotspotWindow is metadata.json's "hotspots" object.
type HotspotWindow struct {
	FirstDay string `json:"first_day"`
	LastDay  string `json:"last_day"`
	Features int    `json:"features"`
}

func ParseMetadata(r io.Reader) (Metadata, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return Metadata{}, err
	}
	var parsed struct {
		Extract struct {
			Request struct {
				Start string `json:"start"`
				End   string `json:"end"`
			} `json:"request"`
		} `json:"extract"`
		Hotspots *HotspotWindow `json:"hotspots"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return Metadata{}, Errors{"metadata: " + err.Error()}
	}
	var errs Errors
	start, end := parsed.Extract.Request.Start, parsed.Extract.Request.End
	if !ValidDate(start) || !ValidDate(end) || start > end {
		errs.add("metadata: extract.request.start/end must be YYYY-MM-DD dates with start <= end")
	}
	return Metadata{Raw: raw, Start: start, End: end, Hotspots: parsed.Hotspots}, errs.err()
}

// Area is one feature of areas.geojson with its bounding box.
type Area struct {
	ID                             string
	Name                           string
	Geometry                       json.RawMessage
	MinLon, MinLat, MaxLon, MaxLat float64
}

func ParseAreas(r io.Reader) ([]Area, error) {
	var collection struct {
		Type     string `json:"type"`
		Features []struct {
			Properties struct {
				AreaID string `json:"area_id"`
				Name   string `json:"name"`
			} `json:"properties"`
			Geometry json.RawMessage `json:"geometry"`
		} `json:"features"`
	}
	if err := json.NewDecoder(r).Decode(&collection); err != nil {
		return nil, Errors{"areas: " + err.Error()}
	}
	var errs Errors
	if collection.Type != "FeatureCollection" || len(collection.Features) == 0 {
		errs.add("areas: expected a non-empty FeatureCollection")
	}
	seen := map[string]bool{}
	areas := make([]Area, 0, len(collection.Features))
	for i, f := range collection.Features {
		id := f.Properties.AreaID
		switch {
		case id == "" || f.Properties.Name == "":
			errs.add("areas[%d]: area_id and name are required", i)
			continue
		case seen[id]:
			errs.add("areas[%d]: duplicate area_id %q", i, id)
			continue
		}
		seen[id] = true
		var geometry struct {
			Type        string `json:"type"`
			Coordinates any    `json:"coordinates"`
		}
		if err := json.Unmarshal(f.Geometry, &geometry); err != nil ||
			(geometry.Type != "Polygon" && geometry.Type != "MultiPolygon") {
			errs.add("areas[%d] %q: geometry must be a Polygon or MultiPolygon", i, id)
			continue
		}
		area := Area{ID: id, Name: f.Properties.Name, Geometry: f.Geometry, MinLon: 180, MinLat: 90, MaxLon: -180, MaxLat: -90}
		if !area.extend(geometry.Coordinates) || area.MinLon > area.MaxLon {
			errs.add("areas[%d] %q: coordinates must be [lon, lat] pairs within range", i, id)
			continue
		}
		areas = append(areas, area)
	}
	return areas, errs.err()
}

// extend grows the bounding box over nested coordinate arrays; false on malformed input.
func (a *Area) extend(coords any) bool {
	list, ok := coords.([]any)
	if !ok || len(list) == 0 {
		return false
	}
	if lon, ok := list[0].(float64); ok {
		if len(list) < 2 {
			return false
		}
		lat, ok := list[1].(float64)
		if !ok || lon < -180 || lon > 180 || lat < -90 || lat > 90 {
			return false
		}
		a.MinLon, a.MaxLon = min(a.MinLon, lon), max(a.MaxLon, lon)
		a.MinLat, a.MaxLat = min(a.MinLat, lat), max(a.MaxLat, lat)
		return true
	}
	for _, item := range list {
		if !a.extend(item) {
			return false
		}
	}
	return true
}

// WeeklyRow is one row of weekly_activity.json. ReportedDetections is nil when no
// day of the week had source data; that must never be stored or served as 0.
type WeeklyRow struct {
	AreaID              string `json:"area_id"`
	WeekStart           string `json:"week_start"`
	WeekEnd             string `json:"week_end"`
	ISOWeek             string `json:"iso_week"`
	Instrument          string `json:"instrument"`
	Platform            string `json:"platform"`
	ReportedDetections  *int   `json:"reported_detections"`
	SourceDays          int    `json:"source_days"`
	SourceComplete      bool   `json:"source_complete"`
	WeekComplete        bool   `json:"week_complete"`
	ObservationCoverage string `json:"observation_coverage"`
}

func ParseWeekly(r io.Reader, areaIDs map[string]bool) ([]WeeklyRow, error) {
	var rows []WeeklyRow
	if err := json.NewDecoder(r).Decode(&rows); err != nil {
		return nil, Errors{"weekly: " + err.Error()}
	}
	var errs Errors
	seen := map[string]bool{}
	for i, row := range rows {
		where := fmt.Sprintf("weekly[%d] %s %s %s", i, row.AreaID, row.Platform, row.ISOWeek)
		if !areaIDs[row.AreaID] {
			errs.add("%s: unknown area_id", where)
		}
		if instrument, ok := Platforms[row.Platform]; !ok {
			errs.add("%s: unknown platform", where)
		} else if row.Instrument != instrument {
			errs.add("%s: instrument must be %s", where, instrument)
		}
		start, err := time.Parse(dateLayout, row.WeekStart)
		if err != nil || start.Weekday() != time.Monday {
			errs.add("%s: week_start must be a Monday (YYYY-MM-DD)", where)
		} else {
			year, week := start.ISOWeek()
			if row.ISOWeek != fmt.Sprintf("%d-W%02d", year, week) {
				errs.add("%s: iso_week does not match week_start", where)
			}
			if row.WeekEnd != start.AddDate(0, 0, 7).Format(dateLayout) {
				errs.add("%s: week_end must be the Monday after week_start", where)
			}
		}
		switch {
		case row.SourceDays < 0 || row.SourceDays > 7:
			errs.add("%s: source_days must be 0-7", where)
		case (row.SourceDays == 0) != (row.ReportedDetections == nil):
			errs.add("%s: reported_detections must be null exactly when source_days is 0", where)
		case row.ReportedDetections != nil && *row.ReportedDetections < 0:
			errs.add("%s: reported_detections must not be negative", where)
		}
		if row.SourceComplete != (row.SourceDays == 7) {
			errs.add("%s: source_complete must equal source_days == 7", where)
		}
		key := row.AreaID + "|" + row.Platform + "|" + row.WeekStart
		if seen[key] {
			errs.add("%s: duplicate row", where)
		}
		seen[key] = true
	}
	return rows, errs.err()
}

// Hotspot is one point of hotspots.geojson.
type Hotspot struct {
	Lon, Lat    float64
	AcquiredUTC string
	Day         string
	Platform    string
	Confidence  string
	FRP         float64
	DayNight    string
	Processing  string
	AreaIDs     []string
}

type hotspotFeature struct {
	Geometry struct {
		Type        string    `json:"type"`
		Coordinates []float64 `json:"coordinates"`
	} `json:"geometry"`
	Properties struct {
		AcquiredUTC string   `json:"acquired_utc"`
		Platform    string   `json:"platform"`
		Confidence  string   `json:"confidence"`
		FRP         *float64 `json:"frp"`
		DayNight    string   `json:"daynight"`
		Processing  string   `json:"processing"`
		AreaIDs     []string `json:"area_ids"`
	} `json:"properties"`
}

// DecodeHotspots streams the features of a hotspots.geojson FeatureCollection to
// emit one at a time, so large files are never held in memory twice. It returns the
// number of features; validation problems are returned together as Errors.
func DecodeHotspots(r io.Reader, areaIDs map[string]bool, emit func(Hotspot) error) (int, error) {
	dec := json.NewDecoder(r)
	if err := expectDelim(dec, '{'); err != nil {
		return 0, Errors{"hotspots: " + err.Error()}
	}
	var errs Errors
	count := 0
	for dec.More() {
		key, err := dec.Token()
		if err != nil {
			return count, Errors{"hotspots: " + err.Error()}
		}
		if key != "features" {
			var skip json.RawMessage
			if err := dec.Decode(&skip); err != nil {
				return count, Errors{"hotspots: " + err.Error()}
			}
			continue
		}
		if err := expectDelim(dec, '['); err != nil {
			return count, Errors{"hotspots.features: " + err.Error()}
		}
		for dec.More() {
			var f hotspotFeature
			if err := dec.Decode(&f); err != nil {
				return count, Errors{fmt.Sprintf("hotspots.features[%d]: %v", count, err)}
			}
			h, problem := f.toHotspot(areaIDs)
			if problem != "" {
				errs.add("hotspots.features[%d]: %s", count, problem)
			} else if len(errs) == 0 {
				if err := emit(h); err != nil {
					return count, err
				}
			}
			count++
		}
		if err := expectDelim(dec, ']'); err != nil {
			return count, Errors{"hotspots.features: " + err.Error()}
		}
	}
	return count, errs.err()
}

func (f hotspotFeature) toHotspot(areaIDs map[string]bool) (Hotspot, string) {
	p := f.Properties
	if f.Geometry.Type != "Point" || len(f.Geometry.Coordinates) != 2 {
		return Hotspot{}, "geometry must be a Point [lon, lat]"
	}
	lon, lat := f.Geometry.Coordinates[0], f.Geometry.Coordinates[1]
	if lon < -180 || lon > 180 || lat < -90 || lat > 90 {
		return Hotspot{}, "coordinates out of range"
	}
	acquired, err := time.Parse(acquiredLayout, p.AcquiredUTC)
	if err != nil {
		return Hotspot{}, "acquired_utc must look like 2026-11-14T05:03Z"
	}
	if _, ok := Platforms[p.Platform]; !ok {
		return Hotspot{}, fmt.Sprintf("unknown platform %q", p.Platform)
	}
	if p.FRP == nil {
		return Hotspot{}, "frp is required"
	}
	for _, id := range p.AreaIDs {
		if !areaIDs[id] {
			return Hotspot{}, fmt.Sprintf("unknown area_id %q", id)
		}
	}
	return Hotspot{
		Lon: lon, Lat: lat, AcquiredUTC: p.AcquiredUTC, Day: acquired.Format(dateLayout),
		Platform: p.Platform, Confidence: p.Confidence, FRP: *p.FRP, DayNight: p.DayNight,
		Processing: p.Processing, AreaIDs: p.AreaIDs,
	}, ""
}

func expectDelim(dec *json.Decoder, want json.Delim) error {
	token, err := dec.Token()
	if err != nil {
		return err
	}
	if token != want {
		return fmt.Errorf("expected %q, got %v", want, token)
	}
	return nil
}
