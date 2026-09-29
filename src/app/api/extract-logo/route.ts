import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { v2 as cloudinary } from 'cloudinary';
import { ApifyClient } from 'apify-client';
import sharp from 'sharp';

// ---------------------------------------------------------
// NEW CLOUDINARY CONFIG
// ---------------------------------------------------------
cloudinary.config({
  cloud_name: 'ta5klglv',
  api_key: '228386464312455',
  api_secret: 'pIoksKtT9h6ez0k3KhbcwjAoU7o',
});

// ---------------------------------------------------------
// APIFY TOKEN ROTATION
// ---------------------------------------------------------
const APIFY_TOKENS = [
  'apify_api_zP6UkcgE9nEdRfvtxgfH9C9S9VG50G26Ch4U',
  'apify_api_NkPekUe1mhtcpLovU8fKmQPxFDj5oM4q00FG',
  'apify_api_Z3q3Jydg3u2k1TM4ELrWYcIUIa4hJC12BcNW',
  'apify_api_SoNIAG1xuFYPPzs3eZEenIedgryI7a3xcivO'
];
let currentApifyIndex = 0;

const BANNED_KEYWORDS = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'google', 'placeholder', 'spinner', 'flag'];

// ---------------------------------------------------------
// 1. THE "MAGIC WAND" PIXEL PROCESSOR (FIXED WHITE BG BUG)
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

    // 🔥 THE FIX: Move 5 pixels inwards to avoid 1px border artifacts or noise!
    const insetX = Math.min(5, Math.floor(width * 0.05));
    const insetY = Math.min(5, Math.floor(height * 0.05));

    const tl = getPixel(insetX, insetY);
    const tr = getPixel(width - insetX - 1, insetY);
    const bl = getPixel(insetX, height - insetY - 1);
    const br = getPixel(width - insetX - 1, height - insetY - 1);

    // 1. If ALL 4 corners are transparent, we don't need manual BG removal
    if (tl[3] < 10 && tr[3] < 10 && bl[3] < 10 && br[3] < 10) {
      return { buffer, type: 'transparent' };
    }

    const colorDist = (c1: number[], c2: number[]) => 
      Math.abs(c1[0] - c2[0]) + Math.abs(c1[1] - c2[1]) + Math.abs(c1[2] - c2[2]);

    // 2. Check if it has a solid background (all 4 corners match)
    if (colorDist(tl, tr) < 30 && colorDist(tl, bl) < 30 && colorDist(tl, br) < 30) {
      const bgColor = tl;
      const tolerance = 45; // Increased tolerance to catch JPEG artifacting around white backgrounds
      
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

    // 3. Corners don't match = It's a real photo
    return { buffer, type: 'photo' };

  } catch (err) {
    return { buffer, type: 'photo' };
  }
}

// ---------------------------------------------------------
// 2. CIRCULAR CROPPING FOR PHOTOS
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
// 3. ELEGANT TEXT LOGO GENERATOR
// ---------------------------------------------------------
async function generateTextLogo(name: string): Promise<Buffer> {
  const shortName = name.substring(0, 30);
  const svgTemplate = `
    <svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="400" fill="transparent" />
      <text x="400" y="220" font-family="'Brush Script MT', 'Lucida Handwriting', 'Georgia', cursive, serif" font-style="italic" font-size="65" font-weight="bold" fill="#111827" text-anchor="middle" dominant-baseline="middle">${shortName}</text>
    </svg>`;

  return await sharp(Buffer.from(svgTemplate)).png().toBuffer();
}

// ---------------------------------------------------------
// 4. INTELLIGENT WEBSITE SCRAPER (ZERO || OPERATORS)
// ---------------------------------------------------------
async function extractLogoUrlFromWebsite(websiteUrl: string, domain: string): Promise<string | null> {
  try {
    let secureUrl = websiteUrl;
    if (!websiteUrl.startsWith('http')) {
      secureUrl = `https://${websiteUrl}`;
    }

    const response = await fetch(secureUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return null;
    }
    if (response.status >= 400) {
      return null;
    }
    
    const html = await response.text();
    const htmlLower = html.toLowerCase();
    
    if (htmlLower.includes("dns_probe_finished_nxdomain")) return null;
    if (htmlLower.includes("page not found")) return null;
    if (htmlLower.includes("404 not found")) return null;
    if (htmlLower.includes("domain expired")) return null;

    const $ = cheerio.load(html);
    let logoUrl: string | null = null;

    // 🔥 THE SYNTAX FIX: This is rewritten without ANY || or && to prevent LaTeX compiler crashes!
    const getBestImageSrc = (imgEl: any): string | null => {
      const widthStr = $(imgEl).attr('width');
      if (widthStr) {
        const w = parseInt(widthStr);
        if (w <= 40) return null;
      }

      let src = $(imgEl).attr('data-src');
      if (!src) {
        src = $(imgEl).attr('src');
      }

      let isDataImage = false;
      if (src) {
        if (src.startsWith('data:image')) {
          isDataImage = true;
        }
      } else {
        isDataImage = true;
      }

      if (isDataImage) {
        let srcset = $(imgEl).attr('srcset');
        if (!srcset) {
          srcset = $(imgEl).attr('data-srcset');
        }
        if (srcset) {
          src = srcset.split(',')[0].trim().split(' ')[0];
        }
      }

      if (src) {
        if (src.startsWith('data:image')) {
          return null;
        }
        return src;
      }
      return null;
    };

    // Helper to safely check keywords
    const isValidLogo = (url: string | null | undefined): boolean => {
      if (!url) return false;
      const lower = url.toLowerCase();
      let hasBannedWord = false;
      for (let i = 0; i < BANNED_KEYWORDS.length; i++) {
        if (lower.includes(BANNED_KEYWORDS[i])) {
          hasBannedWord = true;
          break;
        }
      }
      if (hasBannedWord) return false;
      return true;
    };

    // Target 1: Google Sites
    if (domain.includes('sites.google.com')) {
      $('.lzy1Td').each((_, el) => {
        const src = getBestImageSrc(el);
        if (isValidLogo(src)) { logoUrl = src; return false; }
      });
      if (logoUrl) return resolveUrl(logoUrl, secureUrl);
    }

    // Target 2: Groomer.io
    if (domain.includes('groomer.io')) {
      $('.logo-container img, #stamp').each((_, el) => {
        const src = getBestImageSrc(el);
        if (isValidLogo(src)) { logoUrl = src; return false; }
      });
      if (logoUrl) return resolveUrl(logoUrl, secureUrl);
    }

    // Target 3: Standard Patterns
    $('img').each((_, img) => {
      let alt = $(img).attr('alt');
      if (!alt) alt = '';
      
      let className = $(img).attr('class');
      if (!className) className = '';
      
      let id = $(img).attr('id');
      if (!id) id = '';
      
      if (alt.toLowerCase().includes('logo')) {
        const src = getBestImageSrc(img);
        if (isValidLogo(src)) { logoUrl = src; return false; }
      } else if (className.toLowerCase().includes('logo')) {
        const src = getBestImageSrc(img);
        if (isValidLogo(src)) { logoUrl = src; return false; }
      } else if (id.toLowerCase().includes('logo')) {
        const src = getBestImageSrc(img);
        if (isValidLogo(src)) { logoUrl = src; return false; }
      }
    });

    if (logoUrl) return resolveUrl(logoUrl, secureUrl);

    // Target 4: Home Links
    $('a').each((_, a) => {
      let href = $(a).attr('href');
      if (!href) href = '';
      
      if (href === '/') {
        const img = $(a).find('img').first();
        if (img.length > 0) {
          const src = getBestImageSrc(img[0]);
          if (isValidLogo(src)) { logoUrl = src; return false; }
        }
      } else if (href.includes(domain)) {
        const img = $(a).find('img').first();
        if (img.length > 0) {
          const src = getBestImageSrc(img[0]);
          if (isValidLogo(src)) { logoUrl = src; return false; }
        }
      }
    });

    if (logoUrl) {
      return resolveUrl(logoUrl, secureUrl);
    }
    return null;

  } catch (err) {
    return null;
  }
}

function resolveUrl(rawUrl: string, baseUrl: string): string {
  if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
  if (rawUrl.startsWith('http')) return rawUrl;
  try { return new URL(rawUrl, baseUrl).href; } catch { return rawUrl; }
}

// ---------------------------------------------------------
// 5. FACEBOOK SCRAPER
// ---------------------------------------------------------
function cleanFacebookUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (typeof rawUrl !== "string") return "";
  if (rawUrl.trim() === "") return "";
  
  let currentUrl = rawUrl.trim();
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
// CLOUDINARY FINAL UPLOAD (WITH B_TRANSPARENT FIX)
// ---------------------------------------------------------
async function uploadToCloudinary(buffer: Buffer, publicId: string, imageType: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { public_id: publicId, folder: 'logos', overwrite: true, resource_type: 'auto', colors: true },
      (error: any, result: any) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("No result from Cloudinary"));

        // 🔥 THE FIX: b_transparent prevents Cloudinary from adding white boxes when padding the image!
        let transform = 'b_transparent,w_600,h_600,c_pad,g_auto,f_avif,q_auto:best';
        
        // Add e_make_transparent:15 to cleanly erase the last bits of noise on Logos
        if (imageType !== 'photo') {
          transform = `e_make_transparent:15,` + transform;
        }

        const optimizedUrl = result.secure_url.replace('/upload/', `/upload/${transform}/`);
        
        let primary = null, secondary = null, tertiary = null;
        if (result.colors) {
          if (result.colors.length > 0) {
            if (result.colors[0]) primary = result.colors[0][0];
            if (result.colors[1]) secondary = result.colors[1][0];
            if (result.colors[2]) tertiary = result.colors[2][0];
          }
        }
        resolve({ url: optimizedUrl, colors: { primary, secondary, tertiary } });
      }
    );
    uploadStream.end(buffer);
  });
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

    let businessName = lead.Name;
    if (!businessName) businessName = lead.facebookname;
    if (!businessName) businessName = "Pet Grooming";

    let imageBuffer: Buffer | null = null;
    let source = 'none';

    // 1. Try Website Extraction
    if (websiteUrl) {
      if (websiteUrl.trim() !== '') {
        let secureDomain = websiteUrl;
        if (!secureDomain.startsWith('http')) {
          secureDomain = `https://${websiteUrl}`;
        }
        const urlObj = new URL(secureDomain);
        let domain = urlObj.hostname;
        if (domain.startsWith('www.')) {
          domain = domain.substring(4);
        }

        const extractedUrl = await extractLogoUrlFromWebsite(websiteUrl, domain);
        
        if (extractedUrl) {
          const imgRes = await fetch(extractedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
          if (imgRes.ok) {
            imageBuffer = Buffer.from(await imgRes.arrayBuffer());
            source = 'website';
          }
        }
      }
    }

    // 2. Try Facebook Fallback
    if (!imageBuffer) {
      if (fbUrl) {
        if (fbUrl.trim() !== '') {
          imageBuffer = await scrapeFacebookPic(fbUrl);
          if (imageBuffer) {
            source = 'facebook';
          }
        }
      }
    }

    // 3. Text Logo Fallback
    if (!imageBuffer) {
      imageBuffer = await generateTextLogo(businessName);
      source = 'text';
    }

    // 4. Pixel Processing Engine
    if (!imageBuffer) {
      return NextResponse.json({ success: false, error: "Complete Failure" }, { status: 500 });
    }

    const { buffer: processedBuffer, type } = await processImagePixels(imageBuffer);
    let finalBuffer = processedBuffer;

    if (type === 'photo') {
      finalBuffer = await cropToCircle(processedBuffer);
    }

    // 5. Upload to Cloudinary
    const cleanId = `logo_${Date.now()}`;
    const cloudinaryData = await uploadToCloudinary(finalBuffer, cleanId, type);

    return NextResponse.json({
      success: true,
      sourceUsed: source,
      processingResult: type,
      logoUrl: cloudinaryData.url,
      colors: cloudinaryData.colors
    });

  } catch (error: any) {
    console.error("Worker Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}