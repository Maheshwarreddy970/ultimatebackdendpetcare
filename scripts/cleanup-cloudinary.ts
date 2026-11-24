/**
 * Delete Cloudinary images that are NOT present anywhere in Firestore.
 *
 * Location:  <project root>/scripts/cleanup-cloudinary.ts
 *
 * Run:
 *   yarn tsx scripts/cleanup-cloudinary.ts                 -> DRY RUN (deletes nothing)
 *   yarn tsx scripts/cleanup-cloudinary.ts --delete        -> deletes for real (PERMANENT)
 *
 * Options:
 *   --ignore-leads        do NOT protect logoUrl on lead docs (docs whose ID is an email).
 *                         Default: lead logos ARE kept, because they are present in Firebase.
 *   --prefix=logos/       only touch Cloudinary public_ids starting with this (default logos/)
 *   --min-age-hours=24    never delete anything uploaded in the last N hours (default 24)
 *   --force               skip the safety stops
 */
import fs from "node:fs";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";

const COLLECTION = "websites"; // <- change if your Firestore collection has another name

// ---------- tiny .env.local loader (no extra packages) ----------
function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) {
    console.error(`.env.local not found in ${process.cwd()} - run this from the project root.`);
    process.exit(1);
  }
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnvLocal();

const REQUIRED = [
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing in .env.local:", missing.join(", "));
  process.exit(1);
}

// ---------- flags ----------
const flag = (name: string) => process.argv.includes(`--${name}`);
const opt = (name: string, def: string) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : def;
};
const DO_DELETE = flag("delete");
const FORCE = flag("force");
const IGNORE_LEADS = flag("ignore-leads");
const PREFIX = opt("prefix", "logos/");
const MIN_AGE_HOURS = Number(opt("min-age-hours", "24"));

// ---------- helpers ----------
// Cloudinary URL -> public_id (removes transformations like f_auto,q_auto, the v123 version, and file extension)
function toPublicId(url: string): string | null {
  const m = url.match(/\/upload\/(?:[^/]+\/)*?v\d+\/([^?#\s]+)/);
  if (!m) return null;
  return decodeURIComponent(m[1]).replace(/\.(png|jpe?g|webp|gif|svg|avif|heic)$/i, "");
}

// Walk through ANY nested map / array / string and collect every Cloudinary URL
function collectUrls(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    const found = value.match(/https?:\/\/res\.cloudinary\.com\/[^\s"'<>)]+/g);
    if (found) for (const u of found) out.add(u);
  } else if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectUrls(v, out);
  }
}

function toIds(urls: Set<string>): Set<string> {
  const ids = new Set<string>();
  for (const u of urls) {
    const id = toPublicId(u);
    if (id) ids.add(id);
  }
  return ids;
}

async function listAllCloudinary() {
  const all: { public_id: string; created_at: string }[] = [];
  let next_cursor: string | undefined;
  do {
    const res = await cloudinary.api.resources({
      resource_type: "image",
      type: "upload",
      prefix: PREFIX,
      max_results: 500,
      next_cursor,
    });
    all.push(...res.resources);
    next_cursor = res.next_cursor;
  } while (next_cursor);
  return all;
}

// ---------- main ----------
async function main() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  const db = getFirestore(app);

  // 1) Loop over EVERY doc in Firestore
  const snap = await getDocs(collection(db, COLLECTION));
  const siteUrls = new Set<string>();
  const leadUrls = new Set<string>();
  const websitesWithoutImages: string[] = [];
  let websites = 0;
  let leads = 0;

  snap.forEach((d) => {
    const data = d.data();
    if (d.id.includes("@")) {
      // Lead doc (ID is an email): scan EVERY field for Cloudinary URLs (logoUrl and anything else)
      leads++;
      collectUrls(data, leadUrls);
    } else {
      // Website doc (ID is a slug): scan EVERYTHING inside, incl. websiteOneData
      websites++;
      const urls = new Set<string>();
      collectUrls(data, urls);
      if (urls.size === 0) websitesWithoutImages.push(d.id);
      for (const u of urls) siteUrls.add(u);
    }
  });

  const siteIds = toIds(siteUrls);
  const leadIds = toIds(leadUrls);
  const leadOnlyIds = [...leadIds].filter((id) => !siteIds.has(id));

  const usedIds = new Set(siteIds);
  if (!IGNORE_LEADS) for (const id of leadIds) usedIds.add(id);

  console.log(`Firestore docs read: ${snap.size}  ->  ${websites} websites, ${leads} lead docs`);
  console.log(`Cloudinary images used by websites: ${siteIds.size}`);
  console.log(
    `Logos only on lead docs (no website yet): ${leadOnlyIds.length} -> ` +
      (IGNORE_LEADS ? "will be DELETED (--ignore-leads)" : "KEPT"),
  );
  if (websitesWithoutImages.length) {
    console.log(
      `Websites with NO Cloudinary URL inside (${websitesWithoutImages.length}), e.g.:`,
      websitesWithoutImages.slice(0, 10),
    );
  }

  // 2) List what is in Cloudinary
  const all = await listAllCloudinary();
  console.log(`Cloudinary images under "${PREFIX}": ${all.length}`);

  const existing = new Set(all.map((r) => r.public_id));
  const usedFound = [...usedIds].filter((id) => existing.has(id));
  const usedMissing = [...usedIds].filter((id) => !existing.has(id));
  console.log(`Protected images that exist in Cloudinary: ${usedFound.length}`);
  if (usedMissing.length) {
    console.log(
      `Note: ${usedMissing.length} protected IDs are not under "${PREFIX}" (other folder or already deleted), e.g.`,
      usedMissing.slice(0, 5),
    );
  }

  // Safety stops
  if (!FORCE && (websites === 0 || usedIds.size === 0)) {
    console.log("STOP: found 0 websites or 0 image URLs. Check COLLECTION name or Firestore rules.");
    process.exit(1);
  }
  if (!FORCE && usedFound.length < usedIds.size * 0.8) {
    console.log("STOP: fewer than 80% of protected URLs matched Cloudinary. Check --prefix (or use --force).");
    process.exit(1);
  }

  // 3) Everything in Cloudinary that is not protected (and not too new)
  const cutoff = Date.now() - MIN_AGE_HOURS * 3600 * 1000;
  const unused = all
    .filter((r) => !usedIds.has(r.public_id))
    .filter((r) => new Date(r.created_at).getTime() < cutoff)
    .map((r) => r.public_id);

  console.log(`\nImages to DELETE: ${unused.length}   |   Images KEPT: ${all.length - unused.length}`);

  const backup = path.join(process.cwd(), "scripts", "unused-ids-backup.txt");
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.writeFileSync(backup, unused.join("\n"));
  console.log(`Full delete-list saved to ${backup}`);

  if (!DO_DELETE) {
    console.log("\nDRY RUN - nothing deleted. Re-run with --delete to delete for real.");
    return;
  }

  // 4) Delete in batches of 100 (Cloudinary limit per call)
  let deleted = 0;
  for (let i = 0; i < unused.length; i += 100) {
    const batch = unused.slice(i, i + 100);
    const res = await cloudinary.api.delete_resources(batch, {
      resource_type: "image",
      type: "upload",
      invalidate: true,
    });
    deleted += Object.values(res.deleted as Record<string, string>).filter((v) => v === "deleted").length;
    console.log(`Deleted ${deleted}/${unused.length}`);
  }
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error:", e?.message || e);
    process.exit(1);
  });