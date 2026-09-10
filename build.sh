#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

ROOT_FILES=(
  background.html background.js media.css media.js site-modules.js
  offscreen.html offscreen.js popup.html popup.js run.js vergil.png
)

build() {
  local platform="$1"
  local dist_dir="dist-$platform" output_file

  case "$platform" in
    chrome)
      output_file="yamato-chrome.zip"
      ;;
    firefox)
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

  cp "manifest.$platform.json" "$dist_dir/manifest.json"
  deno run --allow-read=public/misc/block.txt,"$dist_dir/manifest.json" --allow-write="$dist_dir" build-media-rules.js "$dist_dir"
  # MAIN and isolated worlds need distinct filenames.
  cat site-modules.js site-guard.js > "$dist_dir/site-main.js"

  cp -r public "$dist_dir/"
  # One-play APNG, separate audio, silent video.
  ffmpeg -v error -c:v libvpx-vp9 -i public/assets/jc.webm -an \
    -vf 'scale=480:-1,format=rgba,tpad=stop_mode=add:stop_duration=0.1:color=black@0' \
    -plays 1 -f apng -y "$dist_dir/public/assets/jc.png"
  ffmpeg -v error -i public/assets/jc.webm -vn -c:a libopus -b:a 96k -y "$dist_dir/public/sounds/jc.ogg"
  ffmpeg -v error -i public/assets/jc.webm -an -c:v copy -y "$dist_dir/public/assets/jc.webm"
  cp -r pages "$dist_dir/"

  for file in "${ROOT_FILES[@]}"; do
    cp "$file" "$dist_dir/$file"
  done

  if command -v zip >/dev/null 2>&1; then
    (cd "$dist_dir" && zip -r -FS "../$output_file" .)
  else
    (cd "$dist_dir" && bsdtar --format zip -cf "../$output_file" -- *)
  fi

  echo "Build complete for $platform. Output created: $output_file"
}
if [ "$#" -eq 0 ]; then
  set -- chrome firefox
fi
for platform in "$@"; do build "$platform"; done
