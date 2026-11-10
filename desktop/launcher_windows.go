//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
)

func launchBrowser(appURL, dataDir string) error {
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
		edge := filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe")
		if fileExists(edge) {
			return exec.Command(edge, "--app="+appURL, "--user-data-dir="+filepath.Join(dataDir, "profile"), "--window-size=1440,920", "--no-first-run", "--no-default-browser-check").Start()
		}
	}
	return errors.New("Microsoft Edge was not found. Install or repair Edge, then reopen the desktop application; data has not been changed")
}
