//go:build linux

package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestLinuxBrowserIsolation(t *testing.T) {
	root := filepath.Join(t.TempDir(), "profile folder with spaces")
	args := linuxBrowserArgs("http://127.0.0.1:47831", root)
	want := []string{"--app=http://127.0.0.1:47831", "--user-data-dir=" + filepath.Join(root, "profile"), "--class=OmniStreamStudio", "--window-size=1280,900", "--no-first-run", "--no-default-browser-check"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("unsafe or unexpected browser arguments: %q", args)
	}
	// No shell splitting and no --no-sandbox escape in distributed application.
}

func TestLinuxMissingBrowserReportsRecovery(t *testing.T) {
	t.Setenv("NTK_OMNISTREAM_BROWSER", "/nonexistent-omnistream-test/browser")
	if launchBrowser("http://127.0.0.1:47831", t.TempDir()) == nil {
		t.Fatal("missing executable accepted")
	}
}
