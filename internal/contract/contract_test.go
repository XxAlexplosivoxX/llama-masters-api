package contract

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

const fixture = "../../testdata/tiny-region/"

func read(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(fixture + name)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func fixtureAreaIDs(t *testing.T) map[string]bool {
	areas, err := ParseAreas(bytes.NewReader(read(t, "areas.geojson")))
	if err != nil {
		t.Fatalf("areas: %v", err)
	}
	ids := map[string]bool{}
	for _, a := range areas {
		ids[a.ID] = true
	}
	return ids
}

func TestFixtureIsValid(t *testing.T) {
	meta, err := ParseMetadata(bytes.NewReader(read(t, "metadata.json")))
	if err != nil || meta.Start != "2026-10-26" || meta.End != "2026-11-14" {
		t.Fatalf("metadata: %+v, %v", meta, err)
	}
	areas, err := ParseAreas(bytes.NewReader(read(t, "areas.geojson")))
	if err != nil || len(areas) != 2 {
		t.Fatalf("areas: %d, %v", len(areas), err)
	}
	if a := areas[0]; a.MinLon != -90 || a.MaxLon != -88 || a.MinLat != 14 || a.MaxLat != 15 {
		t.Errorf("north bbox = %+v", a)
	}
	rows, err := ParseWeekly(bytes.NewReader(read(t, "weekly_activity.json")), fixtureAreaIDs(t))
	if err != nil || len(rows) != 12 {
		t.Fatalf("weekly: %d rows, %v", len(rows), err)
	}
	var points []Hotspot
	n, err := DecodeHotspots(bytes.NewReader(read(t, "hotspots.geojson")), fixtureAreaIDs(t), func(h Hotspot) error {
		points = append(points, h)
		return nil
	})
	if err != nil || n != 6 || len(points) != 6 {
		t.Fatalf("hotspots: %d/%d, %v", n, len(points), err)
	}
	if points[0].Day != "2026-11-14" || len(points[3].AreaIDs) != 2 {
		t.Errorf("unexpected points: %+v", points)
	}
}

// mutateWeekly edits the first fixture row and returns the validation error.
func mutateWeekly(t *testing.T, edit func(map[string]any)) error {
	var rows []map[string]any
	json.Unmarshal(read(t, "weekly_activity.json"), &rows)
	edit(rows[0])
	data, _ := json.Marshal(rows)
	_, err := ParseWeekly(bytes.NewReader(data), fixtureAreaIDs(t))
	return err
}

func TestWeeklyRules(t *testing.T) {
	cases := map[string]struct {
		edit func(map[string]any)
		want string
	}{
		"null with source data": {func(r map[string]any) { r["reported_detections"] = nil }, "null exactly when"},
		"zero without source": {func(r map[string]any) {
			r["source_days"], r["source_complete"], r["reported_detections"] = 0, false, 0
		}, "null exactly when"},
		"not a monday":       {func(r map[string]any) { r["week_start"] = "2026-10-27" }, "must be a Monday"},
		"wrong iso week":     {func(r map[string]any) { r["iso_week"] = "2026-W40" }, "iso_week"},
		"wrong week end":     {func(r map[string]any) { r["week_end"] = "2026-11-01" }, "week_end"},
		"unknown area":       {func(r map[string]any) { r["area_id"] = "east" }, "unknown area_id"},
		"unknown platform":   {func(r map[string]any) { r["platform"] = "GOES-16" }, "unknown platform"},
		"wrong instrument":   {func(r map[string]any) { r["instrument"] = "MODIS" }, "instrument must be VIIRS"},
		"source days > 7":    {func(r map[string]any) { r["source_days"] = 8 }, "source_days must be 0-7"},
		"inconsistent flags": {func(r map[string]any) { r["source_complete"] = false }, "source_complete"},
		"duplicate row":      {func(r map[string]any) { r["platform"], r["week_start"] = "S-NPP", "2026-11-02" }, "duplicate row"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			err := mutateWeekly(t, c.edit)
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("got %v, want error containing %q", err, c.want)
			}
		})
	}
}

func TestAreaAndHotspotRules(t *testing.T) {
	dup := `{"type":"FeatureCollection","features":[
		{"type":"Feature","properties":{"area_id":"a","name":"A"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}},
		{"type":"Feature","properties":{"area_id":"a","name":"B"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}}]}`
	if _, err := ParseAreas(strings.NewReader(dup)); err == nil || !strings.Contains(err.Error(), "duplicate area_id") {
		t.Errorf("duplicate area: %v", err)
	}
	bad := `{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[0,95]},
		"properties":{"acquired_utc":"2026-11-14T05:03Z","platform":"NOAA-20","confidence":"high","frp":1,"daynight":"N","processing":"NRT","area_ids":[]}}]}`
	emitted := 0
	_, err := DecodeHotspots(strings.NewReader(bad), map[string]bool{}, func(Hotspot) error { emitted++; return nil })
	if err == nil || !strings.Contains(err.Error(), "out of range") || emitted != 0 {
		t.Errorf("out-of-range hotspot: %v (emitted %d)", err, emitted)
	}
	if ValidName("Americas 2026") || !ValidName("americas-2026_10") {
		t.Error("ValidName rules")
	}
}
