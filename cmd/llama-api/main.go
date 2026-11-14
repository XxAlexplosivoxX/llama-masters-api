// Command llama-api serves burning-activity region exports and uploads them.
//
//	llama-api serve                                   run the API (settings from the environment)
//	llama-api push --dir PATH [--url URL] [--name N]  upload a data/processed/<region>/ folder
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/XxAlexplosivoxX/llama-masters-api/internal/api"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/cache"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/config"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/contract"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/push"
	"github.com/XxAlexplosivoxX/llama-masters-api/internal/store"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	var err error
	switch command {
	case "serve":
		err = serve(log)
	case "push":
		err = pushCommand(os.Args[2:])
	default:
		fmt.Fprintln(os.Stderr, "usage: llama-api serve | llama-api push --dir PATH [--url URL] [--name NAME]")
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func serve(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0o755); err != nil {
		return err
	}
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("opening %s: %w", cfg.DBPath, err)
	}
	defer st.Close()
	c := cache.New(cfg.CacheMaxEntries, cfg.CacheTTL, cfg.CacheMaxItemBytes)
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(cfg, st, c, log),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	if cfg.APIToken == "" {
		log.Warn("API_TOKEN is not set: uploads and deletes are disabled")
	}
	log.Info("listening", "addr", cfg.Addr, "db", cfg.DBPath, "cache_entries", cfg.CacheMaxEntries,
		"cache_ttl", cfg.CacheTTL, "cors", cfg.CORSOrigins)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	errs := make(chan error, 1)
	go func() { errs <- server.ListenAndServe() }()
	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdown); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func pushCommand(args []string) error {
	flags := flag.NewFlagSet("push", flag.ExitOnError)
	dir := flags.String("dir", "", "prepared region folder, e.g. ../llama-masters-research/data/processed/americas-2026-10")
	baseURL := flags.String("url", envOr("API_URL", "http://localhost:8080"), "API base URL (env API_URL)")
	name := flags.String("name", "", "region name (default: the folder name)")
	token := flags.String("token", os.Getenv("API_TOKEN"), "bearer token (env API_TOKEN)")
	flags.Parse(args)
	if *dir == "" {
		flags.Usage()
		return errors.New("--dir is required")
	}
	if *name == "" {
		*name = filepath.Base(filepath.Clean(*dir))
	}
	if !contract.ValidName(*name) {
		return fmt.Errorf("region name %q may contain only lowercase letters, digits, '-' and '_'", *name)
	}
	if *token == "" {
		return errors.New("set API_TOKEN or pass --token")
	}
	start := time.Now()
	result, err := push.Push(context.Background(), &http.Client{Timeout: 10 * time.Minute}, *baseURL, *token, *dir, *name)
	if result != nil {
		out, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(out))
	}
	if err == nil {
		fmt.Fprintf(os.Stderr, "uploaded %s in %s\n", *name, time.Since(start).Round(time.Millisecond))
	}
	return err
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
