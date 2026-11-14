package api

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"mime/multipart"
	"net/http"

	"github.com/XxAlexplosivoxX/llama-masters-api/internal/contract"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/store"
)

// Multipart parts above this size are spooled to temporary files instead of memory.
const multipartMemory = 32 << 20

// upload stores a region export sent as multipart parts metadata, areas, weekly and
// (optionally) hotspots. The new version replaces the current one only if every
// part is valid; otherwise the response lists the problems and nothing changes.
func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !contract.ValidName(name) {
		writeError(w, http.StatusBadRequest, "region name may contain only lowercase letters, digits, '-' and '_'")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadBytes)
	if err := r.ParseMultipartForm(multipartMemory); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("upload exceeds %d MB", s.cfg.MaxUploadBytes>>20))
			return
		}
		writeError(w, http.StatusBadRequest, "expected multipart/form-data with parts metadata, areas, weekly, hotspots")
		return
	}
	defer r.MultipartForm.RemoveAll()

	digest := sha256.New()
	open := func(part string, required bool) (io.ReadCloser, error) {
		file, _, err := r.FormFile(part)
		if errors.Is(err, http.ErrMissingFile) && !required {
			return nil, nil
		}
		if err != nil {
			return nil, contract.Errors{fmt.Sprintf("missing part %q", part)}
		}
		return hashed{file, digest}, nil
	}

	var meta contract.Metadata
	var areas []contract.Area
	var weekly []contract.WeeklyRow
	areaIDs := map[string]bool{}
	steps := []struct {
		part  string
		parse func(io.Reader) error
	}{
		{"metadata", func(rd io.Reader) (err error) { meta, err = contract.ParseMetadata(rd); return }},
		{"areas", func(rd io.Reader) (err error) {
			areas, err = contract.ParseAreas(rd)
			for _, a := range areas {
				areaIDs[a.ID] = true
			}
			return
		}},
		{"weekly", func(rd io.Reader) (err error) { weekly, err = contract.ParseWeekly(rd, areaIDs); return }},
	}
	var problems contract.Errors
	for _, step := range steps {
		part, err := open(step.part, true)
		if err == nil {
			err = step.parse(part)
			part.Close()
		}
		if errs, ok := contract.AsErrors(err); ok {
			problems = append(problems, errs...)
		} else if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if len(problems) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "invalid export", "details": problems})
		return
	}

	upload, err := s.store.BeginUpload(r.Context(), name, meta, areas, weekly)
	if err != nil {
		s.log.Error("starting upload", "region", name, "error", err)
		writeError(w, http.StatusInternalServerError, "could not store the upload")
		return
	}
	defer upload.Rollback()
	hotspots := 0
	if part, err := open("hotspots", false); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	} else if part != nil {
		hotspots, err = contract.DecodeHotspots(part, areaIDs, upload.AddHotspot)
		part.Close()
		if errs, ok := contract.AsErrors(err); ok {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": "invalid export", "details": errs})
			return
		} else if err != nil {
			s.log.Error("storing hotspots", "region", name, "error", err)
			writeError(w, http.StatusInternalServerError, "could not store the upload")
			return
		}
	}
	sum := hex.EncodeToString(digest.Sum(nil))
	version, err := upload.Commit(sum, s.cfg.KeepVersions)
	if err != nil {
		s.log.Error("committing upload", "region", name, "error", err)
		writeError(w, http.StatusInternalServerError, "could not store the upload")
		return
	}
	s.purge(name)
	s.log.Info("region uploaded", "region", name, "version", version, "areas", len(areas), "weekly_rows", len(weekly),
		"hotspots", hotspots)
	writeJSON(w, http.StatusCreated, map[string]any{
		"region": name, "version": version, "sha256": sum,
		"areas": len(areas), "weekly_rows": len(weekly), "hotspots": hotspots,
	})
}

func (s *Server) deleteRegion(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	err := s.store.DeleteRegion(r.Context(), name)
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, fmt.Sprintf("unknown region %q", name))
		return
	case err != nil:
		s.log.Error("deleting region", "region", name, "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	s.purge(name)
	w.WriteHeader(http.StatusNoContent)
}

// purge drops cached responses for one region and for the region list.
func (s *Server) purge(region string) {
	s.cache.PurgePrefix(region + "@")
	s.cache.PurgePrefix(allRegionsKey)
}

// hashed feeds every byte read from a part into the upload's SHA-256, so the digest
// fingerprints the whole export (parts in order: metadata, areas, weekly, hotspots).
type hashed struct {
	multipart.File
	digest hash.Hash
}

// Close reads what the parser left (e.g. trailing whitespace) so the digest covers
// the full part, then closes it.
func (h hashed) Close() error {
	io.Copy(io.Discard, h)
	return h.File.Close()
}

func (h hashed) Read(p []byte) (int, error) {
	n, err := h.File.Read(p)
	h.digest.Write(p[:n])
	return n, err
}
