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
// 3. INTELLIGENT WEBSITE SCRAPER (SCORING ENGINE)
// ---------------------------------------------------------
interface LogoCandidate {
  url: string;
  score: number;
}

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

    if (!response.ok) return null;
    if (response.status >= 400) return null;
    
    const html = await response.text();
    const htmlLower = html.toLowerCase();
    
    if (htmlLower.includes("dns_probe_finished_nxdomain")) return null;
    if (htmlLower.includes("page not found")) return null;
    if (htmlLower.includes("404 not found")) return null;
    if (htmlLower.includes("domain expired")) return null;

    const $ = cheerio.load(html);
    const candidates: LogoCandidate[] = [];

    // ZERO "OR" OPERATORS ALLOWED TO PREVENT SYNTAX CRASHES
    const getBestImageSrc = (imgEl: any): string | null => {
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
          const parts = srcset.split(',');
          const lastPart = parts[parts.length - 1];
          src = lastPart.trim().split(' ')[0];
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

    // Evaluate every single image on the page
    $('img').each((_, img) => {
      let score = 0;
      let isTarget = false;

      let alt = $(img).attr('alt');
      if (!alt) alt = '';
      
      let className = $(img).attr('class');
      if (!className) className = '';
      
      let id = $(img).attr('id');
      if (!id) id = '';

      let nameAttr = $(img).attr('name');
      if (!nameAttr) nameAttr = '';
      
      let srcAttr = $(img).attr('src');
      if (!srcAttr) srcAttr = '';

      // Direct Image Attribute Checks
      if (alt.toLowerCase().includes('logo')) { isTarget = true; score += 30; }
      if (className.toLowerCase().includes('logo')) { isTarget = true; score += 20; }
      if (id.toLowerCase().includes('logo')) { isTarget = true; score += 20; }
      if (nameAttr.toLowerCase().includes('logo')) { isTarget = true; score += 25; }
      if (srcAttr.toLowerCase().includes('logo')) { isTarget = true; score += 20; }

      // Check Parent <a> wrapper (Catches "A Dog's Best Friend" logo__link!)
      const parentA = $(img).closest('a');
      if (parentA.length > 0) {
        let parentClass = parentA.attr('class');
        if (!parentClass) parentClass = '';
        if (parentClass.toLowerCase().includes('logo')) {
          isTarget = true;
          score += 30;
        }

        let href = parentA.attr('href');
        if (!href) href = '';
        if (href === '/') {
          isTarget = true;
          score += 15;
        }
        if (href.includes(domain)) {
          isTarget = true;
          score += 15;
        }
      }

      // Check header/nav wrappers
      if ($(img).closest('header, nav, .header, .nav, #header, #nav').length > 0) {
        score += 20;
      }

      // Penalize tiny icons severely
      let w = $(img).attr('width');
      if (w) {
        let wInt = parseInt(w);
        if (wInt < 50) score -= 100; 
        if (wInt >= 150) score += 10;
        if (wInt >= 300) score += 20;
      }

      if (isTarget) {
        const bestSrc = getBestImageSrc(img);
        if (bestSrc) {
          if (bestSrc.includes('width=')) score += 10;
          if (bestSrc.includes('optimize=')) score += 5;
          
          if (isValidLogo(bestSrc)) {
            candidates.push({ url: bestSrc, score: score });
          }
        }
      }
    });

    // Return the absolute highest scoring image!
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return resolveUrl(candidates[0].url, secureUrl);
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

    const processAndUpload = async (buffer: Buffer) => {
      const { buffer: processedBuffer, type } = await processImagePixels(buffer);
      let finalBuffer = processedBuffer;
      if (type === 'photo') {
        finalBuffer = await cropToCircle(processedBuffer);
      }
      const cleanId = `logo_${Date.now()}`;
      const cData = await uploadToCloudinary(finalBuffer, cleanId);
      return { cData, type };
    };

    // 1. Try Website Extraction
    if (websiteUrl) {
      if (websiteUrl.trim() !== '') {
        let secureDomain = websiteUrl;
        if (!secureDomain.startsWith('http')) secureDomain = `https://${websiteUrl}`;
        const urlObj = new URL(secureDomain);
        let domain = urlObj.hostname;
        if (domain.startsWith('www.')) domain = domain.substring(4);

        const extractedUrl = await extractLogoUrlFromWebsite(websiteUrl, domain);
        
        if (extractedUrl) {
          const imgRes = await fetch(extractedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const result = await processAndUpload(buffer);
            
            if (!isBadColors(result.cData.colors.primary, result.cData.colors.secondary, result.cData.colors.tertiary)) {
               finalCloudinaryData = result.cData;
               source = 'website';
               finalType = result.type;
            }
          }
        }
      }
    }

    // 2. Try Facebook Fallback
    if (!finalCloudinaryData) {
      if (fbUrl) {
        if (fbUrl.trim() !== '') {
          const fbBuffer = await scrapeFacebookPic(fbUrl);
          if (fbBuffer) {
            const result = await processAndUpload(fbBuffer);
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
         colors: { primary: null, secondary: null, tertiary: null }
       });
    }

    return NextResponse.json({
      success: true,
      sourceUsed: source,
      processingResult: finalType,
      logoUrl: finalCloudinaryData.url,
      colors: finalCloudinaryData.colors
    });

  } catch (error: any) {
    console.error("Worker Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}