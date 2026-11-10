//go:build linux

package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

func linuxBrowserArgs(appURL, dataDir string) []string {
	return []string{"--app=" + appURL, "--user-data-dir=" + filepath.Join(dataDir, "profile"), "--class=OmniStreamStudio", "--window-size=1280,900", "--no-first-run", "--no-default-browser-check"}
}

func launchBrowser(appURL, dataDir string) error {
	// An explicit executable override is useful for distro-specific installations.
	// This is a path, never a shell command, and browser sandboxing stays enabled.
	candidates := []string{"chromium", "chromium-browser", "google-chrome-stable", "google-chrome", "microsoft-edge-stable", "microsoft-edge", "brave-browser"}
	if override := os.Getenv("NTK_OMNISTREAM_BROWSER"); override != "" {
		executable, err := exec.LookPath(override)
		if err != nil {
			return fmt.Errorf("configured browser executable was not found: %w", err)
		}
		return startLinuxBrowser(executable, linuxBrowserArgs(appURL, dataDir)...)
	}
	for _, name := range candidates {
		if executable, err := exec.LookPath(name); err == nil {
			return startLinuxBrowser(executable, linuxBrowserArgs(appURL, dataDir)...)
		}
	}
	if opener, err := exec.LookPath("xdg-open"); err == nil {
		log.Print("No Chromium-based browser found; opening the stable local URL in the default browser. Storage belongs to that browser profile.")
		return startLinuxBrowser(opener, appURL)
	}
	return errors.New("no supported browser was found. Install Chromium, Chrome, Edge or a default browser with xdg-utils, then reopen OmniStream Studio; saved data has not been changed")
}

func startLinuxBrowser(executable string, args ...string) error {
	cmd := exec.Command(executable, args...)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("could not launch the browser: %w", err)
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
