//go:build !windows && !linux

package main

import "errors"

func launchBrowser(appURL, dataDir string) error {
	return errors.New("this desktop launcher currently supports Windows and Linux; use --headless and open the printed local URL on other systems")
}
