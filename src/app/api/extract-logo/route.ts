import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { v2 as cloudinary } from 'cloudinary';
import { ApifyClient } from 'apify-client';
import sharp from 'sharp';

// ---------------------------------------------------------
// NEW CLOUDINARY CONFIG
// ---------------------------------------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


// ---------------------------------------------------------
// APIFY TOKEN ROTATION
// ---------------------------------------------------------
const APIFY_TOKENS = [
  process.env.APIFY_TOKEN_1,
  process.env.APIFY_TOKEN_2,
  process.env.APIFY_TOKEN_3,
  process.env.APIFY_TOKEN_4,
  process.env.APIFY_TOKEN_5,
  process.env.APIFY_TOKEN_6,
  process.env.APIFY_TOKEN_7,
  process.env.APIFY_TOKEN_8,
  process.env.APIFY_TOKEN_9,
  process.env.APIFY_TOKEN_10,
  process.env.APIFY_TOKEN_11,
  process.env.APIFY_TOKEN_12,
].filter(Boolean);

let currentApifyIndex = 0;

const BANNED_KEYWORDS = [
  'facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest',
  'google', 'placeholder', 'spinner', 'flag',
  'sprite', 'paypal', 'trustpilot', 'tripadvisor', 'whatsapp',
];

// Any link going to one of these hosts is NEVER a business logo (it is a social/contact icon)
const SOCIAL_HOSTS = [
  'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
  'tiktok.com', 'youtube.com', 'youtu.be', 'pinterest.com', 'yelp.com',
  'wa.me', 'whatsapp.com', 'snapchat.com', 'threads.net', 'google.com', 'goo.gl',
];

// ---------------------------------------------------------
// SMALL HELPERS
// ---------------------------------------------------------
function str(v: unknown): string {
  if (typeof v === 'string') return v;
  return '';
}

function stripWww(host: string): string {
  const h = host.toLowerCase();
  if (h.startsWith('www.')) return h.substring(4);
  return h;
}

function hostOf(url: string): string {
  try {
    return stripWww(new URL(url).hostname);
  } catch {
    return '';
  }
}

function isSocialUrl(url: string): boolean {
  const h = hostOf(url);
  if (h === '') return false;
  return SOCIAL_HOSTS.some((s) => h === s || h.endsWith('.' + s));
}

function hasBannedWord(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_KEYWORDS.some((k) => lower.includes(k));
}

function resolveUrl(rawUrl: string, baseUrl: string): string {
  if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
  if (rawUrl.startsWith('http')) return rawUrl;
  try { return new URL(rawUrl, baseUrl).href; } catch { return rawUrl; }
}

// Link that points to the business's OWN homepage (hostname must match exactly, path must be "/")
function isOwnHomeLink(href: string, ownHosts: string[], baseUrl: string): boolean {
  if (href === '') return false;
  if (href.startsWith('#')) return false;
  try {
    const u = new URL(href, baseUrl);
    const h = stripWww(u.hostname);
    if (!ownHosts.includes(h)) return false;
    if (u.pathname === '/') return true;
    if (u.pathname === '') return true;
    return /^\/(index|home)(\.html?)?\/?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

// Wix serves resized/cropped copies (…/v1/fill/w_20,h_20…). Strip that to get the ORIGINAL full-quality file.
function normalizeImageUrl(url: string): string {
  const wix = url.match(/^(https?:\/\/static\.wixstatic\.com\/media\/[^/?#]+)/);
  if (wix) return wix[1];
  return url;
}

// Picks the largest entry of a srcset (regex based, because Wix URLs contain commas)
function largestFromSrcset(srcset: string): string {
  const re = /(\S+)\s+(\d+(?:\.\d+)?)[wx]/g;
  let best = '';
  let bestVal = -1;
  let m: RegExpExecArray | null = re.exec(srcset);
  while (m !== null) {
    const val = parseFloat(m[2]);
    if (val > bestVal) {
      bestVal = val;
      best = m[1];
    }
    m = re.exec(srcset);
  }
  return best;
}

function collectLdNodes(node: any, out: any[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectLdNodes(n, out));
    return;
  }
  if (typeof node === 'object') {
    out.push(node);
    if (node['@graph']) collectLdNodes(node['@graph'], out);
  }
}

function ldImageUrl(v: any): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return ldImageUrl(v[0]);
  if (v && typeof v === 'object') {
    if (str(v.url) !== '') return str(v.url);
    return str(v.contentUrl);
  }
  return '';
}

// ---------------------------------------------------------
// 1. THE "MAGIC WAND" PIXEL PROCESSOR 
// ---------------------------------------------------------
async function processImagePixels(buffer: Buffer): Promise<{ buffer: Buffer, type: 'transparent' | 'bg_removed' | 'photo' }> {
  try {
    const img = sharp(buffer);
    const metadata = await img.metadata();
    const width = metadata.width ? metadata.width : 600;
    const height = metadata.height ? metadata.height : 600;

    const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const getPixel = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };

    const insetX = Math.min(5, Math.floor(width * 0.05));
    const insetY = Math.min(5, Math.floor(height * 0.05));

    const tl = getPixel(insetX, insetY);
    const tr = getPixel(width - insetX - 1, insetY);
    const bl = getPixel(insetX, height - insetY - 1);
    const br = getPixel(width - insetX - 1, height - insetY - 1);

    // If ANY corner is already transparent (Alpha < 250), it is ALREADY a Transparent Logo!
    let isAlreadyTransparent = false;
    if (tl[3] < 250) isAlreadyTransparent = true;
    if (tr[3] < 250) isAlreadyTransparent = true;
    if (bl[3] < 250) isAlreadyTransparent = true;
    if (br[3] < 250) isAlreadyTransparent = true;

    if (isAlreadyTransparent) {
      return { buffer, type: 'transparent' };
    }

    const colorDist = (c1: number[], c2: number[]) =>
      Math.abs(c1[0] - c2[0]) + Math.abs(c1[1] - c2[1]) + Math.abs(c1[2] - c2[2]);

    let cornersMatch = false;
    if (colorDist(tl, tr) < 30) {
      if (colorDist(tl, bl) < 30) {
        if (colorDist(tl, br) < 30) {
          cornersMatch = true;
        }
      }
    }

    if (cornersMatch) {
      const r = tl[0];
      const g = tl[1];
      const b = tl[2];

      let isWhite = false;
      if (r > 230) {
        if (g > 230) {
          if (b > 230) isWhite = true;
        }
      }

      let isBlack = false;
      if (r < 25) {
        if (g < 25) {
          if (b < 25) isBlack = true;
        }
      }

      if (isWhite) {
        const bgColor = tl;
        const tolerance = 45;
        const newData = Buffer.from(data);
        for (let i = 0; i < newData.length; i += 4) {
          const dist = Math.abs(newData[i] - bgColor[0]) + Math.abs(newData[i + 1] - bgColor[1]) + Math.abs(newData[i + 2] - bgColor[2]);
          if (dist <= tolerance) {
            newData[i + 3] = 0;
          }
        }
        const transparentBuffer = await sharp(newData, { raw: { width, height, channels: 4 } }).png().toBuffer();
        return { buffer: transparentBuffer, type: 'bg_removed' };
      }

      if (isBlack) {
        const bgColor = tl;
        const tolerance = 45;
        const newData = Buffer.from(data);
        for (let i = 0; i < newData.length; i += 4) {
          const dist = Math.abs(newData[i] - bgColor[0]) + Math.abs(newData[i + 1] - bgColor[1]) + Math.abs(newData[i + 2] - bgColor[2]);
          if (dist <= tolerance) {
            newData[i + 3] = 0;
          }
        }
        const transparentBuffer = await sharp(newData, { raw: { width, height, channels: 4 } }).png().toBuffer();
        return { buffer: transparentBuffer, type: 'bg_removed' };
      }
    }

    return { buffer, type: 'photo' };

  } catch (err) {
    return { buffer, type: 'photo' };
  }
}

// ---------------------------------------------------------
// 2. CIRCULAR CROPPING FOR PHOTOS (Facebook profile pictures only)
// ---------------------------------------------------------
async function cropToCircle(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ? metadata.width : 600;
  const height = metadata.height ? metadata.height : 600;
  const size = Math.min(width, height);
  const r = size / 2;

  const circleSvg = `<svg height="${size}" width="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`;

  return await sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: Buffer.from(circleSvg), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// ---------------------------------------------------------
// 2b. DOWNLOAD + VERIFY + NORMALIZE (real pixel size is the source of truth)
// ---------------------------------------------------------
async function downloadImage(url: string, referer: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': referer,
        'Accept': 'image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > 15 * 1024 * 1024) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

// Rejects tiny icons / absurd aspect ratios using the REAL decoded size (not the HTML width attribute),
// then converts anything (jpg/webp/avif/svg/gif) to a clean PNG capped at 800px for the color + magic-wand steps.
async function normalizeLogoBuffer(buffer: Buffer, minShortSide: number): Promise<Buffer | null> {
  try {
    const meta = await sharp(buffer, { density: 300 }).metadata();
    const w = meta.width ? meta.width : 0;
    const h = meta.height ? meta.height : 0;
    if (w === 0) return null;
    if (h === 0) return null;
    if (Math.max(w, h) < 120) return null;           // a 20px / 64px social icon can never be a logo
    if (Math.min(w, h) < minShortSide) return null;
    const ratio = w / h;
    if (ratio > 8) return null;                      // banner strips
    if (ratio < 0.15) return null;

    return await sharp(buffer, { density: 300 })
      .rotate()
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------
// 3. INTELLIGENT WEBSITE SCRAPER (SCORING ENGINE v2)
// ---------------------------------------------------------
interface LogoCandidate {
  url: string;
  score: number;
  minShortSide: number;
  reasons: string[];
}

const MIN_CANDIDATE_SCORE = 20;
const MAX_CANDIDATES_TO_TRY = 4;

// Pure function (no network) so it can be unit-tested with saved HTML
function parseLogoCandidates(html: string, baseUrl: string, domain: string): LogoCandidate[] {
  const $ = cheerio.load(html);
  const found = new Map<string, LogoCandidate>();
  const ownHosts = [stripWww(domain), hostOf(baseUrl)];
  const brand = stripWww(domain).split('.')[0].toLowerCase();

  const add = (raw: string, score: number, minShortSide: number, reasons: string[]) => {
    const trimmed = raw.trim();
    if (trimmed === '') return;
    if (trimmed.startsWith('data:')) return;
    const abs = normalizeImageUrl(resolveUrl(trimmed, baseUrl));
    if (!abs.startsWith('http')) return;
    const existing = found.get(abs);
    if (existing) {
      if (score > existing.score) {
        existing.score = score;
        existing.reasons = reasons;
      }
      return;
    }
    found.set(abs, { url: abs, score, minShortSide, reasons });
  };

  // ---- Strategy A: JSON-LD (Organization / LocalBusiness "logo") -> most reliable when present
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() as string);
      const nodes: any[] = [];
      collectLdNodes(data, nodes);
      nodes.forEach((n) => {
        const u = ldImageUrl(n.logo);
        if (u !== '') add(u, 90, 40, ['json-ld logo +90']);
      });
    } catch {
      // ignore broken JSON-LD
    }
  });

  // ---- Strategy B: microdata itemprop="logo"
  $('[itemprop="logo"]').each((_, el) => {
    const $el = $(el);
    let v = str($el.attr('src'));
    if (v === '') v = str($el.attr('content'));
    if (v === '') v = str($el.attr('href'));
    if (v === '') v = str($el.find('img').first().attr('src'));
    if (v !== '') add(v, 80, 40, ['itemprop=logo +80']);
  });

  // ---- Strategy C: score EVERY <img> on the page
  $('img').each((index, img) => {
    const $img = $(img);

    // best usable src (lazy-load attrs first, then srcset)
    let src = '';
    const attrs = ['data-src', 'data-lazy-src', 'data-original', 'src'];
    for (let i = 0; i < attrs.length; i++) {
      const v = str($img.attr(attrs[i])).trim();
      if (v !== '' && !v.startsWith('data:')) {
        src = v;
        break;
      }
    }
    if (src === '') {
      let ss = str($img.attr('srcset'));
      if (ss === '') ss = str($img.attr('data-srcset'));
      if (ss !== '') src = largestFromSrcset(ss);
    }
    if (src === '') return;
    if (src.startsWith('data:')) return;

    const srcLower = src.toLowerCase();
    const alt = str($img.attr('alt')).toLowerCase();
    const cls = str($img.attr('class')).toLowerCase();
    const id = str($img.attr('id')).toLowerCase();
    const nm = str($img.attr('name')).toLowerCase();

    const parentA = $img.closest('a');
    const href = str(parentA.attr('href')).trim();
    const parentCls = str(parentA.attr('class')).toLowerCase();
    const parentAria = str(parentA.attr('aria-label')).toLowerCase();
    const absHref = href === '' ? '' : resolveUrl(href, baseUrl);

    // ---- HARD REJECTS ----
    // (the Skallywags bug: instagram.com/skallywags.ca contains the business domain, so the old
    //  "href.includes(domain)" rule treated the Instagram icon as a logo)
    if (absHref !== '' && isSocialUrl(absHref)) return;
    if (href.toLowerCase().startsWith('mailto:')) return;
    if (href.toLowerCase().startsWith('tel:')) return;
    if (hasBannedWord(srcLower + ' ' + alt + ' ' + parentAria + ' ' + absHref)) return;

    let score = 0;
    const reasons: string[] = [];
    const bump = (n: number, why: string) => {
      score += n;
      reasons.push(`${why} ${n > 0 ? '+' : ''}${n}`);
    };

    // keyword signals
    if (alt.includes('logo')) bump(30, 'alt has "logo"');
    if (cls.includes('logo')) bump(20, 'class has "logo"');
    if (id.includes('logo')) bump(20, 'id has "logo"');
    if (nm.includes('logo')) bump(25, 'name has "logo"');
    if (srcLower.includes('logo')) bump(20, 'src has "logo"');
    if (parentCls.includes('logo')) bump(30, 'parent link class has "logo"');
    if (parentAria.includes('logo')) bump(20, 'parent aria-label has "logo"');
    if (brand.length >= 3) {
      if (alt.includes(brand)) bump(15, 'alt has brand name');
    }
    if (cls.includes('social')) bump(-40, 'class has "social"');

    // structural signals
    if (isOwnHomeLink(href, ownHosts, baseUrl)) bump(15, 'links to own homepage');
    if ($img.closest('header, nav, [role="banner"], .header, .navbar, .nav, #header, #nav').length > 0) {
      bump(20, 'inside header/nav');
    }
    if ($img.closest('footer, .footer, #footer').length > 0) bump(-30, 'inside footer');

    // declared size signals
    let w = 0;
    const wAttr = str($img.attr('width'));
    if (wAttr !== '' && !wAttr.includes('%')) {
      const p = parseInt(wAttr, 10);
      if (!isNaN(p)) w = p;
    }
    if (w === 0) {
      const mWix = src.match(/[,/]w_(\d+)/);
      const mQuery = src.match(/[?&]w(?:idth)?=(\d+)/);
      if (mWix) w = parseInt(mWix[1], 10);
      else if (mQuery) w = parseInt(mQuery[1], 10);
    }
    let h = 0;
    const hAttr = str($img.attr('height'));
    if (hAttr !== '' && !hAttr.includes('%')) {
      const p = parseInt(hAttr, 10);
      if (!isNaN(p)) h = p;
    }

    if (w > 0 && w < 50) bump(-100, `tiny width ${w}px`);
    if (h > 0 && h < 30) bump(-100, `tiny height ${h}px`);
    if (w >= 150) bump(10, 'width >= 150');
    if (w >= 300) bump(20, 'width >= 300');
    if (w > 1400) bump(-25, 'hero-sized');
    if (w > 0 && h > 0) {
      const ratio = w / h;
      if (ratio > 8 || ratio < 0.15) bump(-30, 'odd aspect ratio');
      else if (ratio >= 0.5 && ratio <= 5) bump(5, 'logo-like aspect ratio');
    }

    // position signal: logos are almost always among the first images in the DOM
    if (index < 3) bump(12, 'one of first 3 images');
    else if (index < 8) bump(6, 'one of first 8 images');

    // score floor: a negative / weak image is NOT a candidate (old code accepted anything)
    if (score >= MIN_CANDIDATE_SCORE) {
      add(src, score, 40, reasons);
    }
  });

  // ---- Strategy D: meta + icon fallbacks (lower scores, stricter size checks after download)
  const og = str($('meta[property="og:image"]').attr('content'));
  if (og !== '') add(og, 22, 200, ['og:image +22']);
  const tw = str($('meta[name="twitter:image"]').attr('content'));
  if (tw !== '') add(tw, 20, 200, ['twitter:image +20']);
  $('link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"]').each((_, el) => {
    const v = str($(el).attr('href'));
    if (v !== '') add(v, 18, 120, ['apple-touch-icon +18']);
  });
  $('link[rel~="icon"]').each((_, el) => {
    const v = str($(el).attr('href'));
    if (v !== '') add(v, 12, 120, ['icon +12']);
  });

  return Array.from(found.values()).sort((a, b) => b.score - a.score);
}

async function extractLogoCandidates(websiteUrl: string, domain: string): Promise<{ candidates: LogoCandidate[]; pageUrl: string }> {
  try {
    let secureUrl = websiteUrl;
    if (!websiteUrl.startsWith('http')) {
      secureUrl = `https://${websiteUrl}`;
    }

    const response = await fetch(secureUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) return { candidates: [], pageUrl: secureUrl };
    if (response.status >= 400) return { candidates: [], pageUrl: secureUrl };

    const html = await response.text();
    const htmlLower = html.toLowerCase();

    if (htmlLower.includes("dns_probe_finished_nxdomain")) return { candidates: [], pageUrl: secureUrl };
    if (htmlLower.includes("page not found")) return { candidates: [], pageUrl: secureUrl };
    if (htmlLower.includes("404 not found")) return { candidates: [], pageUrl: secureUrl };
    if (htmlLower.includes("domain expired")) return { candidates: [], pageUrl: secureUrl };

    // response.url = final URL after redirects (http -> https, non-www -> www, etc.)
    const finalUrl = response.url ? response.url : secureUrl;
    return { candidates: parseLogoCandidates(html, finalUrl, domain), pageUrl: finalUrl };

  } catch (err) {
    return { candidates: [], pageUrl: websiteUrl };
  }
}

// ---------------------------------------------------------
// 4. FACEBOOK SCRAPER
// ---------------------------------------------------------
function cleanFacebookUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (typeof rawUrl !== "string") return "";
  if (rawUrl.trim() === "") return "";

  let currentUrl = rawUrl.trim();

  if (currentUrl.includes(',')) {
    currentUrl = currentUrl.split(',')[0].trim();
  }

  if (!currentUrl.startsWith("http")) currentUrl = "https://" + currentUrl;
  try {
    const urlObj = new URL(currentUrl);
    if (urlObj.hostname.includes("facebook.com")) urlObj.hostname = "www.facebook.com";
    const segments = urlObj.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      if (segments[0] === "profile.php") {
        const profileId = urlObj.searchParams.get("id");
        if (profileId) return `https://www.facebook.com/profile.php?id=${profileId}`;
        return `https://www.facebook.com/`;
      }
      return `https://www.facebook.com/${segments[0]}`;
    }
    return `https://www.facebook.com/`;
  } catch {
    return rawUrl;
  }
}

async function scrapeFacebookPic(fbRawUrl: string): Promise<Buffer | null> {
  const cleanFbUrl = cleanFacebookUrl(fbRawUrl);
  let attempts = 0;
  let rawImageUrl = "";

  while (attempts < APIFY_TOKENS.length) {
    try {
      const apifyClient = new ApifyClient({ token: APIFY_TOKENS[currentApifyIndex] });
      const run = await apifyClient.actor("apify/facebook-pages-scraper").call({ startUrls: [{ url: cleanFbUrl }], maxPosts: 0 });
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

      if (items) {
        if (items[0]) {
          const data = items[0] as any;
          if (data.profilePictureUrl) {
            rawImageUrl = data.profilePictureUrl;
          } else if (data.profilePicture) {
            rawImageUrl = data.profilePicture;
          } else if (data.profilePic) {
            rawImageUrl = data.profilePic;
          } else if (data.image) {
            rawImageUrl = data.image;
          } else if (data.avatar) {
            rawImageUrl = data.avatar;
          }

          if (typeof rawImageUrl === 'object') {
            if ((rawImageUrl as any).url) {
              rawImageUrl = (rawImageUrl as any).url;
            } else if ((rawImageUrl as any).src) {
              rawImageUrl = (rawImageUrl as any).src;
            }
          }
        }
      }
      break;
    } catch (err: any) {
      currentApifyIndex = (currentApifyIndex + 1) % APIFY_TOKENS.length;
      attempts++;
    }
  }

  if (rawImageUrl) {
    const highResUrl = rawImageUrl.replace(/\d+x\d+/g, '960x960');
    let imgRes = await fetch(highResUrl);
    if (!imgRes.ok) {
      imgRes = await fetch(rawImageUrl);
    }
    if (imgRes.ok) {
      return Buffer.from(await imgRes.arrayBuffer());
    }
  }
  return null;
}

// ---------------------------------------------------------
// CLOUDINARY FINAL UPLOAD (RAW PUBLIC URL)
// ---------------------------------------------------------
async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: 'logos', overwrite: true, resource_type: 'auto', colors: true },
      (error: any, result: any) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("No result from Cloudinary"));

        let primary = null, secondary = null, tertiary = null;
        if (result.colors) {
          if (result.colors.length > 0) {
            if (result.colors[0]) primary = result.colors[0][0];
            if (result.colors[1]) secondary = result.colors[1][0];
            if (result.colors[2]) tertiary = result.colors[2][0];
          }
        }

        resolve({ url: result.secure_url, colors: { primary, secondary, tertiary } });
      }
    );
    uploadStream.end(buffer);
  });
}

// We keep the lossless PNG as the master (colors + transparency are analysed on it),
// and DELIVER an optimized version: Cloudinary serves AVIF to browsers that support it
// (WebP/PNG otherwise) with automatic quality. No file extension in the URL = f_auto decides.
function optimizedDeliveryUrl(masterUrl: string): string {
  if (!masterUrl.includes('/upload/')) return masterUrl;
  const withTransform = masterUrl.replace('/upload/', '/upload/f_auto,q_auto/');
  return withTransform.replace(/\.(png|jpe?g|webp|avif|gif|svg)$/i, '');
}

function isBadColors(p: string | null, s: string | null, t: string | null): boolean {
  if (!p) return false;
  const primary = p.toUpperCase();
  const secondary = s ? s.toUpperCase() : "";
  const tertiary = t ? t.toUpperCase() : "";

  if (primary === "#101928" && secondary === "#FFFFFF") return true;
  if (primary === "#0987C5" && secondary === "#FFFFFE" && tertiary === "#EFFBFD") return true;
  if (primary === "#000000" && secondary === "#000000") return true;
  if (primary === "#FFFFFF" && secondary === "") return true;

  return false;
}

// ---------------------------------------------------------
// MAIN API ENDPOINT
// ---------------------------------------------------------
export async function POST(req: Request) {
  try {
    const lead = await req.json();
    const websiteUrl = lead.Website;

    let fbUrl = lead.Facebook;
    if (!fbUrl) fbUrl = lead.facebookurl;
    if (!fbUrl) fbUrl = lead.aifacebook;
    if (!fbUrl) fbUrl = lead["extracted facebook"];

    let finalCloudinaryData: any = null;
    let finalType = 'none';
    let source = 'none';
    let logoSourceUrl = '';
    let matchReasons: string[] = [];

    // circle crop is ONLY for Facebook profile photos. Website logos must never be cropped
    // (a wide 787x273 logo would lose its sides).
    const processAndUpload = async (buffer: Buffer, allowCircleCrop: boolean) => {
      const { buffer: processedBuffer, type } = await processImagePixels(buffer);
      let finalBuffer = processedBuffer;
      if (type === 'photo') {
        if (allowCircleCrop) {
          finalBuffer = await cropToCircle(processedBuffer);
        }
      }
      const cleanId = `logo_${Date.now()}`;
      const cData = await uploadToCloudinary(finalBuffer, cleanId);
      return { cData, type };
    };

    // 1. Try Website Extraction (best candidates first, verified by real pixel size)
    if (typeof websiteUrl === 'string') {
      if (websiteUrl.trim() !== '') {
        try {
          let secureDomain = websiteUrl.trim();
          if (!secureDomain.startsWith('http')) secureDomain = `https://${secureDomain}`;
          const urlObj = new URL(secureDomain);
          let domain = urlObj.hostname;
          if (domain.startsWith('www.')) domain = domain.substring(4);

          const { candidates, pageUrl } = await extractLogoCandidates(websiteUrl.trim(), domain);
          const toTry = candidates.slice(0, MAX_CANDIDATES_TO_TRY);

          for (let i = 0; i < toTry.length; i++) {
            const cand = toTry[i];
            const raw = await downloadImage(cand.url, pageUrl);
            if (!raw) continue;

            const normalized = await normalizeLogoBuffer(raw, cand.minShortSide);
            if (!normalized) continue; // too small (icon) or wrong shape -> try next candidate

            const result = await processAndUpload(normalized, false);
            if (isBadColors(result.cData.colors.primary, result.cData.colors.secondary, result.cData.colors.tertiary)) {
              continue;
            }

            finalCloudinaryData = result.cData;
            source = 'website';
            finalType = result.type;
            logoSourceUrl = cand.url;
            matchReasons = cand.reasons;
            break;
          }
        } catch (siteErr) {
          console.error("Website logo extraction failed:", siteErr);
        }
      }
    }

    // 2. Try Facebook Fallback
    if (!finalCloudinaryData) {
      if (fbUrl) {
        if (fbUrl.trim() !== '') {
          const fbBuffer = await scrapeFacebookPic(fbUrl);
          if (fbBuffer) {
            const result = await processAndUpload(fbBuffer, true);
            finalCloudinaryData = result.cData;
            source = 'facebook';
            finalType = result.type;
          }
        }
      }
    }

    // 3. NO MORE TEXT LOGO GENERATION! Just skip if nothing is found.
    if (!finalCloudinaryData) {
      return NextResponse.json({
        success: true,
        sourceUsed: 'none',
        processingResult: 'skipped',
        logoUrl: '',
        logoOriginalUrl: '',
        logoSourceUrl: '',
        matchReasons: [],
        colors: { primary: null, secondary: null, tertiary: null }
      });
    }

    return NextResponse.json({
      success: true,
      sourceUsed: source,
      processingResult: finalType,
      logoUrl: optimizedDeliveryUrl(finalCloudinaryData.url),   // AVIF/WebP auto-optimized
      logoOriginalUrl: finalCloudinaryData.url,                  // lossless PNG master
      logoSourceUrl: logoSourceUrl,                              // where on the website it came from
      matchReasons: matchReasons,                                // why it won (for debugging)
      colors: finalCloudinaryData.colors
    });

  } catch (error: any) {
    console.error("Worker Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}