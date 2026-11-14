// Package push uploads a prepared region folder (data/processed/<region>/ from
// llama-masters-research) to a running API.
package push

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// Parts maps multipart part names to the files prepare_region.py writes, in upload order.
var Parts = []struct {
	Name, File string
	Required   bool
}{
	{"metadata", "metadata.json", true},
	{"areas", "areas.geojson", true},
	{"weekly", "weekly_activity.json", true},
	{"hotspots", "hotspots.geojson", false},
}

// Push streams the folder's files as one multipart PUT to {baseURL}/v1/regions/{name},
// without loading them into memory, and returns the server's JSON response.
func Push(ctx context.Context, client *http.Client, baseURL, token, dir, name string) (map[string]any, error) {
	for _, p := range Parts {
		if _, err := os.Stat(filepath.Join(dir, p.File)); err != nil && p.Required {
			return nil, fmt.Errorf("%s: %w", p.File, err)
		}
	}
	body, writer := io.Pipe()
	form := multipart.NewWriter(writer)
	go func() {
		writer.CloseWithError(writeParts(form, dir))
	}()
	endpoint := strings.TrimRight(baseURL, "/") + "/v1/regions/" + url.PathEscape(name)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("%s: unreadable response (%w)", resp.Status, err)
	}
	if resp.StatusCode != http.StatusCreated {
		return result, fmt.Errorf("upload rejected: %s", resp.Status)
	}
	return result, nil
}

func writeParts(form *multipart.Writer, dir string) error {
	for _, p := range Parts {
		file, err := os.Open(filepath.Join(dir, p.File))
		if os.IsNotExist(err) && !p.Required {
			continue
		}
		if err != nil {
			return err
		}
		part, err := form.CreateFormFile(p.Name, p.File)
		if err == nil {
			_, err = io.Copy(part, file)
		}
		file.Close()
		if err != nil {
			return err
		}
	}
	return form.Close()
}
