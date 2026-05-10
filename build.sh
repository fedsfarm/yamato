#!/usr/bin/env bash

ROOT_FILES=(
  "background.html"
  "background.js"
  "offscreen.html"
  "offscreen.js"
  "popup.html"
  "popup.js"
  "run.js"
  "vergil.png"
)

build() {
  local platform="$1"
  local manifest_file=""
  local dist_dir=""
  local output_file=""

  case "$platform" in
    chrome)
      manifest_file="manifest.chrome.json"
      dist_dir="dist-chrome"
      output_file="yamato-chrome.zip"
      ;;
    firefox)
      manifest_file="manifest.firefox.json"
      dist_dir="dist-firefox"
      output_file="yamato-firefox.xpi"
      ;;
    *)
      echo "Unknown platform: $platform."
      exit 1
      ;;
  esac

  if [ -d "$dist_dir" ]; then
    rm -rf "$dist_dir"
  fi
  mkdir -p "$dist_dir"

  cp "$manifest_file" "$dist_dir/manifest.json"

  cp -r public "$dist_dir/"
  cp -r pages "$dist_dir/"

  for file in "${ROOT_FILES[@]}"; do
    if [ -f "$file" ]; then
      cp "$file" "$dist_dir/$file"
    fi
  done

  (cd "$dist_dir" && zip -r "../$output_file" .)
  #rm -rf "$dist_dir"

  echo "Build complete for $platform. Output created: $output_file"
}


build "chrome"
build "firefox"