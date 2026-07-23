// Build script — runs only inside the GitHub Actions workflow, never needs to
// be installed or run locally. It reads photos/<Album>/*.jpg, pulls date +
// GPS from EXIF, reverse-geocodes GPS to a place name (cached), resizes
// images, and writes the deployable site into _site/.
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import exifr from "exifr";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const PHOTOS_DIR = path.join(ROOT, "photos");
const SITE_DIR = path.join(ROOT, "_site");
const GEOCACHE_PATH = path.join(ROOT, "data", "geocache.json");
const SUPPORTED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const THUMB_WIDTH = 480;
const FULL_MAX = 2000;
const NOMINATIM_UA = "Life-Album-Personal-Site/1.0 (static personal photo album)";

function slugify(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "album";
}

async function loadJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Map of relative file path -> ISO date of the commit that first added it.
// Used as a last-resort date fallback (checkout mtimes aren't the real photo date).
function buildGitAddedDateMap() {
  const map = new Map();
  let log = "";
  try {
    log = execSync(
      'git log --diff-filter=A --format="C|%aI" --name-only -- photos',
      { cwd: ROOT, encoding: "utf8" }
    );
  } catch {
    return map;
  }
  let currentDate = null;
  for (const line of log.split("\n")) {
    if (line.startsWith("C|")) {
      currentDate = line.slice(2).trim();
    } else if (line.trim() && currentDate) {
      // Earlier commits appear later in the log, so keep overwriting —
      // final value ends up being the *first* commit that added the file.
      map.set(line.trim(), currentDate);
    }
  }
  return map;
}

function parseDateFromFilename(filename) {
  const m = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T00:00:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function reverseGeocode(lat, lon, cache) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache[key] !== undefined) return cache[key];

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=vi`;
    const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_UA } });
    const data = await res.json();
    const a = data.address || {};
    const place = a.city || a.town || a.village || a.county || a.state || null;
    const country = a.country || null;
    const label = [place, country].filter(Boolean).join(", ") || null;
    cache[key] = label;
    await sleep(1100); // respect Nominatim's 1 req/sec usage policy
    return label;
  } catch {
    cache[key] = null;
    return null;
  }
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walkAlbums() {
  const entries = await fs.readdir(PHOTOS_DIR, { withFileTypes: true }).catch(() => []);
  const albums = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const albumDir = path.join(PHOTOS_DIR, entry.name);
    const files = (await fs.readdir(albumDir))
      .filter((f) => SUPPORTED_EXT.has(path.extname(f).toLowerCase()))
      .sort();
    if (files.length === 0) continue;
    albums.push({ name: entry.name, dir: albumDir, files });
  }
  return albums;
}

async function main() {
  // _site/photos is restored from the GitHub Actions cache before this script
  // runs (see the workflow), so we deliberately do NOT wipe it — that's what
  // lets already-resized photos be skipped below instead of reprocessed
  // every single build. Everything else is cheap to regenerate from scratch.
  await fs.mkdir(path.join(SITE_DIR, "photos"), { recursive: true });
  await fs.rm(path.join(SITE_DIR, "data"), { recursive: true, force: true });
  await fs.rm(path.join(SITE_DIR, "assets"), { recursive: true, force: true });
  await fs.rm(path.join(SITE_DIR, "index.html"), { force: true });

  const geocache = await loadJson(GEOCACHE_PATH, {});
  const gitDates = buildGitAddedDateMap();
  const albums = await walkAlbums();

  const outAlbums = [];
  const outPhotos = [];

  for (const album of albums) {
    const albumId = slugify(album.name);
    const albumThumbDir = path.join(SITE_DIR, "photos", albumId, "thumb");
    const albumFullDir = path.join(SITE_DIR, "photos", albumId, "full");
    await fs.mkdir(albumThumbDir, { recursive: true });
    await fs.mkdir(albumFullDir, { recursive: true });

    let albumDates = [];

    for (const file of album.files) {
      const filePath = path.join(album.dir, file);
      const relPath = path.relative(ROOT, filePath).split(path.sep).join("/");
      const baseName = slugify(path.parse(file).name);
      const buf = await fs.readFile(filePath);

      let exifData = {};
      try {
        exifData = (await exifr.parse(buf, { gps: true, exif: true, tiff: true })) || {};
      } catch {
        // unreadable EXIF, fall through to other date sources
      }

      let date = null;
      let dateSource = "unknown";
      if (exifData.DateTimeOriginal instanceof Date) {
        date = exifData.DateTimeOriginal.toISOString();
        dateSource = "exif";
      } else {
        const fromName = parseDateFromFilename(file);
        if (fromName) {
          date = fromName;
          dateSource = "filename";
        } else if (gitDates.has(relPath)) {
          date = gitDates.get(relPath);
          dateSource = "git";
        }
      }
      if (date) albumDates.push(date);

      let place = null;
      if (typeof exifData.latitude === "number" && typeof exifData.longitude === "number") {
        place = await reverseGeocode(exifData.latitude, exifData.longitude, geocache);
      }

      const meta = await sharp(buf).metadata();

      // Content hash ties the output name to this exact file's bytes, so
      // replacing a photo (same filename, new content) produces a fresh
      // output instead of silently reusing a stale cached thumbnail.
      const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
      const thumbName = `${baseName}-${hash}.webp`;
      const fullName = `${baseName}-${hash}.webp`;
      const thumbPath = path.join(albumThumbDir, thumbName);
      const fullPath = path.join(albumFullDir, fullName);

      if (!(await fileExists(thumbPath)) || !(await fileExists(fullPath))) {
        await sharp(buf)
          .rotate()
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: 75 })
          .toFile(thumbPath);
        await sharp(buf)
          .rotate()
          .resize({ width: FULL_MAX, height: FULL_MAX, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(fullPath);
      }

      outPhotos.push({
        id: `${albumId}-${baseName}`,
        album: album.name,
        albumId,
        date,
        dateSource,
        place,
        thumb: `photos/${albumId}/thumb/${thumbName}`,
        full: `photos/${albumId}/full/${fullName}`,
        width: meta.width,
        height: meta.height,
      });
    }

    albumDates.sort();
    outAlbums.push({
      id: albumId,
      name: album.name,
      count: album.files.length,
      cover: outPhotos.filter((p) => p.albumId === albumId)[0]?.thumb || null,
      dateStart: albumDates[0] || null,
      dateEnd: albumDates[albumDates.length - 1] || null,
    });
  }

  outPhotos.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  outAlbums.sort((a, b) => (b.dateEnd || "").localeCompare(a.dateEnd || ""));

  await fs.mkdir(path.join(SITE_DIR, "data"), { recursive: true });
  await fs.writeFile(
    path.join(SITE_DIR, "data", "photos.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), albums: outAlbums, photos: outPhotos }, null, 2)
  );

  await fs.mkdir(path.dirname(GEOCACHE_PATH), { recursive: true });
  await fs.writeFile(GEOCACHE_PATH, JSON.stringify(geocache, null, 2));

  for (const f of ["index.html"]) {
    await fs.copyFile(path.join(ROOT, f), path.join(SITE_DIR, f));
  }
  await fs.cp(path.join(ROOT, "assets"), path.join(SITE_DIR, "assets"), { recursive: true });

  console.log(`Built ${outPhotos.length} photos across ${outAlbums.length} albums.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
