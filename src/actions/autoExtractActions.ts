'use server';

import { db } from '@/lib/firebase';
import { collection, query, where, limit, getDocs, updateDoc, doc } from 'firebase/firestore';
import { v2 as cloudinary } from 'cloudinary';
import { ApifyClient } from 'apify-client';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

cloudinary.config({
  cloud_name: 'ta5klglv',
  api_key: '228386464312455',
  api_secret: 'pIoksKtT9h6ez0k3KhbcwjAoU7o',
});

const APIFY_TOKENS = [
  'apify_api_zP6UkcgE9nEdRfvtxgfH9C9S9VG50G26Ch4U',
  'apify_api_NkPekUe1mhtcpLovU8fKmQPxFDj5oM4q00FG',
  'apify_api_Z3q3Jydg3u2k1TM4ELrWYcIUIa4hJC12BcNW',
  'apify_api_SoNIAG1xuFYPPzs3eZEenIedgryI7a3xcivO'
];
let currentApifyIndex = 0;

const BANNED_KEYWORDS = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'google', 'placeholder', 'spinner', 'flag', 'hero', 'banner'];

// ---------------------------------------------------------
// 1. MAGIC WAND PIXEL BACKGROUND REMOVER
// ---------------------------------------------------------
async function processImagePixels(buffer: Buffer): Promise<Buffer> {
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

    let isAlreadyTransparent = false;
    if (tl[3] < 200) isAlreadyTransparent = true;
    if (tr[3] < 200) isAlreadyTransparent = true;
    if (bl[3] < 200) isAlreadyTransparent = true;
    if (br[3] < 200) isAlreadyTransparent = true;

    if (isAlreadyTransparent) {
      return buffer;
    }

    let bgColor = tl;
    const colorDist = (c1: number[], c2: number[]) => Math.abs(c1[0] - c2[0]) + Math.abs(c1[1] - c2[1]) + Math.abs(c1[2] - c2[2]);

    if (colorDist(tr, bl) < 30) {
      bgColor = tr;
    } else if (colorDist(br, bl) < 30) {
      bgColor = br;
    }

    const tolerance = 45; 
    const newData = Buffer.from(data);
    for (let i = 0; i < newData.length; i += 4) {
      const dist = Math.abs(newData[i] - bgColor[0]) + Math.abs(newData[i + 1] - bgColor[1]) + Math.abs(newData[i + 2] - bgColor[2]);
      if (dist <= tolerance) {
        newData[i + 3] = 0; 
      }
    }
    
    return await sharp(newData, { raw: { width, height, channels: 4 } }).png().toBuffer();
  } catch (err) {
    return buffer;
  }
}

// ---------------------------------------------------------
// 2. FRESH, TOP-DOWN "MAGIC" WEBSITE SCRAPER
// ---------------------------------------------------------
function resolveUrl(rawUrl: string, baseUrl: string): string {
  if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
  if (rawUrl.startsWith('http')) return rawUrl;
  try { return new URL(rawUrl, baseUrl).href; } catch { return rawUrl; }
}

async function getBestLogoBufferFromWebsite(websiteUrl: string, domain: string): Promise<Buffer | null> {
  try {
    let secureUrl = websiteUrl;
    if (!websiteUrl.startsWith('http')) secureUrl = `https://${websiteUrl}`;

    const response = await fetch(secureUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) return null;
    if (response.status >= 400) return null;
    const html = await response.text();
    const htmlLower = html.toLowerCase();
    
    if (htmlLower.includes("dns_probe_finished")) return null;
    if (htmlLower.includes("page not found")) return null;

    const $ = cheerio.load(html);
    const candidates: { url: string, score: number }[] = [];

    const getBestImageSrc = (imgEl: any): string | null => {
      let src = $(imgEl).attr('data-src');
      if (!src) src = $(imgEl).attr('src');

      let isDataImage = false;
      if (src) { if (src.startsWith('data:image')) isDataImage = true; } else { isDataImage = true; }

      if (isDataImage) {
        let srcset = $(imgEl).attr('srcset');
        if (!srcset) srcset = $(imgEl).attr('data-srcset');
        if (srcset) {
          const parts = srcset.split(',');
          src = parts[parts.length - 1].trim().split(' ')[0];
        }
      }

      if (src) {
        if (src.startsWith('data:image')) return null;
        return src;
      }
      return null;
    };

    const isValidLogo = (url: string | null | undefined): boolean => {
      if (!url) return false;
      const lower = url.toLowerCase();
      let hasBanned = false;
      for (let i = 0; i < BANNED_KEYWORDS.length; i++) {
        if (lower.includes(BANNED_KEYWORDS[i])) { hasBanned = true; break; }
      }
      if (hasBanned) return false;
      return true;
    };

    $('*[style*="background-image"]').each((_, el) => {
      let style = $(el).attr('style');
      if (style) {
        let match = style.match(/url\(['"]?(.*?)['"]?\)/i);
        if (match) {
          if (match[1]) {
            let src = match[1].replace(/&quot;/g, '').trim();
            if (isValidLogo(src)) {
              let score = 5000;
              if (src.includes('moegonew')) score += 50000;
              candidates.push({ url: src, score: score });
            }
          }
        }
      }
    });

    $('div, span, a, header, nav, section').each((_, container) => {
      let isLogoContainer = false;
      
      let className = $(container).attr('class'); if (!className) className = '';
      let id = $(container).attr('id'); if (!id) id = '';
      let dataGuide = $(container).attr('data-guide-target'); if (!dataGuide) dataGuide = '';
      let ariaLabel = $(container).attr('aria-label'); if (!ariaLabel) ariaLabel = '';

      const classL = className.toLowerCase();
      const idL = id.toLowerCase();

      if (classL.includes('logo')) isLogoContainer = true;
      if (idL.includes('logo')) isLogoContainer = true;
      if (dataGuide.toLowerCase().includes('logo')) isLogoContainer = true;
      if (classL.includes('brand')) isLogoContainer = true;
      if (classL.includes('site-header')) isLogoContainer = true;
      if (ariaLabel.toLowerCase().includes('home')) isLogoContainer = true;

      if (!isLogoContainer) {
        const tag = $(container).prop('tagName');
        if (tag === 'A') {
          let href = $(container).attr('href'); if (!href) href = '';
          if (href === '/') isLogoContainer = true;
        }
      }

      if (isLogoContainer) {
        const img = $(container).find('img').first();
        if (img.length > 0) {
          let score = 10000; 
          let w = $(img).attr('width');
          if (w) {
            let wInt = parseInt(w);
            if (wInt < 60) score -= 20000; 
          }

          const bestSrc = getBestImageSrc(img[0]);
          if (bestSrc) {
            if (isValidLogo(bestSrc)) {
              candidates.push({ url: bestSrc, score: score });
            }
          }
        }
      }
    });

    if (candidates.length === 0) {
      let imageIndex = 0;
      $('img').each((_, img) => {
        imageIndex++;
        let score = 500 - imageIndex; 

        let alt = $(img).attr('alt'); if (!alt) alt = '';
        if (alt.toLowerCase().includes('logo')) score += 5000;

        let w = $(img).attr('width');
        if (w) {
          let wInt = parseInt(w);
          if (wInt < 60) score -= 20000; 
        }

        const bestSrc = getBestImageSrc(img);
        if (bestSrc) {
          if (isValidLogo(bestSrc)) {
            if (score > 0) candidates.push({ url: bestSrc, score: score });
          }
        }
      });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, 3);

    for (let i = 0; i < topCandidates.length; i++) {
      const fullUrl = resolveUrl(topCandidates[i].url, secureUrl);
      try {
        const res = await fetch(fullUrl, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          return Buffer.from(await res.arrayBuffer());
        }
      } catch (err) {}
    }

    return null;
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------
// 3. FIXED FACEBOOK SCRAPER
// ---------------------------------------------------------
function cleanFacebookUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (typeof rawUrl !== "string") return "";
  let currentUrl = rawUrl.trim();
  if (currentUrl === "") return "";
  
  if (currentUrl.includes(',')) currentUrl = currentUrl.split(',')[0].trim();
  if (!currentUrl.startsWith("http")) currentUrl = "https://" + currentUrl;
  
  try {
    const urlObj = new URL(currentUrl);
    if (urlObj.hostname.includes("facebook.com")) {
      urlObj.hostname = "www.facebook.com";
      let p = urlObj.pathname;
      p = p.replace(/\/about\/?$/i, '');
      p = p.replace(/\/reviews\/?$/i, '');
      p = p.replace(/\/services\/?$/i, '');
      urlObj.pathname = p;
      return urlObj.toString();
    }
    return currentUrl;
  } catch { 
    return rawUrl; 
  }
}

async function scrapeFacebookPic(fbRawUrl: string): Promise<Buffer | null> {
  const cleanFbUrl = cleanFacebookUrl(fbRawUrl);
  if (!cleanFbUrl) return null;

  let attempts = 0;
  let rawImageUrl = "";

  while (attempts < APIFY_TOKENS.length) {
    try {
      const apifyClient = new ApifyClient({ token: APIFY_TOKENS[currentApifyIndex] });
      const run = await apifyClient.actor("apify/facebook-pages-scraper").call({ startUrls: [{ url: cleanFbUrl }], resultsLimit: 1 });
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      
      if (items) {
        if (items[0]) {
          const data = items[0] as any;
          if (data.profilePictureUrl) { rawImageUrl = data.profilePictureUrl; }
          else if (data.profilePicture) { rawImageUrl = data.profilePicture; }
          else if (data.profilePic) { rawImageUrl = data.profilePic; }
          else if (data.image) { rawImageUrl = data.image; }
          else if (data.avatar) { rawImageUrl = data.avatar; }

          if (typeof rawImageUrl === 'object') {
             if ((rawImageUrl as any).url) { rawImageUrl = (rawImageUrl as any).url; } 
             else if ((rawImageUrl as any).src) { rawImageUrl = (rawImageUrl as any).src; }
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
    let imgRes: Response | null = null;
    
    try {
      imgRes = await fetch(highResUrl, { signal: AbortSignal.timeout(10000) });
    } catch (e) {}

    if (!imgRes) {
      try { imgRes = await fetch(rawImageUrl, { signal: AbortSignal.timeout(10000) }); } catch (e) {}
    } else {
      if (!imgRes.ok) {
        try { imgRes = await fetch(rawImageUrl, { signal: AbortSignal.timeout(10000) }); } catch (e) {}
      }
    }

    if (imgRes) {
      if (imgRes.ok) {
        return Buffer.from(await imgRes.arrayBuffer());
      }
    }
  }
  return null;
}

// ---------------------------------------------------------
// 4. CLOUDINARY FINAL UPLOAD (RAW PUBLIC URL)
// ---------------------------------------------------------
export async function uploadBufferToCloudinaryPublic(buffer: Buffer, publicId: string): Promise<any> {
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

// ---------------------------------------------------------
// 🚀 SUPER-FAST BATCH ENGINE (PROCESES MULTIPLE LEADS AT ONCE)
// ---------------------------------------------------------
export async function autoExtractBatch(batchSize: number = 10) {
  try {
    const q = query(collection(db, "leads"), where("logoStatus", "==", "pending"), limit(batchSize));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return { status: 'complete', messages: ['🎉 No more pending records to extract.'] };

    // PRE-LOCK the rows immediately so they don't get double-processed by multiple browsers
    await Promise.all(snapshot.docs.map(docSnap => updateDoc(docSnap.ref, { logoStatus: 'extracting' })));

    // Process all 10 leads simultaneously in parallel
    const promises = snapshot.docs.map(async (docSnap) => {
      const targetItem = docSnap.data();
      const docId = docSnap.id;
      const docRef = docSnap.ref;
      const email = targetItem.FinalEmail ? targetItem.FinalEmail : docId;

      const websiteUrl = targetItem.Website;
      let fbUrl = targetItem.Facebook;
      if (!fbUrl) fbUrl = targetItem.facebookurl;
      if (!fbUrl) fbUrl = targetItem.aifacebook;
      if (!fbUrl) fbUrl = targetItem["extracted facebook"];

      let imageBuffer: Buffer | null = null;

      if (websiteUrl) {
        if (websiteUrl.trim() !== '') {
          let secureDomain = websiteUrl;
          if (!secureDomain.startsWith('http')) secureDomain = `https://${websiteUrl}`;
          const urlObj = new URL(secureDomain);
          let domain = urlObj.hostname;
          if (domain.startsWith('www.')) domain = domain.substring(4);

          imageBuffer = await getBestLogoBufferFromWebsite(websiteUrl, domain);
        }
      }

      if (!imageBuffer) {
        if (fbUrl) {
          if (fbUrl.trim() !== '') {
            imageBuffer = await scrapeFacebookPic(fbUrl);
          }
        }
      }

      if (!imageBuffer) {
        await updateDoc(docRef, { logoStatus: 'manual_review', logoUrl: '' });
        return `⚠️ Skipped (No logo found): ${email}`;
      }

      const processedBuffer = await processImagePixels(imageBuffer);
      const cleanId = `logo_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const cData = await uploadBufferToCloudinaryPublic(processedBuffer, cleanId);

      await updateDoc(docRef, {
        logoUrl: cData.url,
        primary: cData.colors.primary ? cData.colors.primary : "",
        secondary: cData.colors.secondary ? cData.colors.secondary : "",
        tertiary: cData.colors.tertiary ? cData.colors.tertiary : "",
        logoStatus: 'manual_review'
      });

      return `✅ Extracted & BG Removed: ${email}`;
    });

    const results = await Promise.all(promises);
    return { status: 'processing', messages: results };

  } catch (error: any) {
    console.error('Auto Extract Batch Error:', error);
    return { status: 'error', messages: [`Failed: ${error.message}`] };
  }
}

// ---------------------------------------------------------
// UI BUTTON ACTIONS 
// ---------------------------------------------------------
export async function uploadCustomLogo(docId: string, formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file) throw new Error("No file uploaded");
    
    const buffer = Buffer.from(await file.arrayBuffer());
    const cleanId = `custom_${Date.now()}`;
    const res = await uploadBufferToCloudinaryPublic(buffer, cleanId);
    
    let primary = ""; let secondary = ""; let tertiary = "";
    if (res.colors) {
      if (res.colors.primary) primary = res.colors.primary;
      if (res.colors.secondary) secondary = res.colors.secondary;
      if (res.colors.tertiary) tertiary = res.colors.tertiary;
    }

    await updateDoc(doc(db, "leads", docId), { logoUrl: res.url, primary: primary, secondary: secondary, tertiary: tertiary });
    return { success: true, url: res.url };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function manualRemoveBackground(docId: string, imageUrl: string) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to fetch image");
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const processedBuffer = await processImagePixels(buffer);
    const cleanId = `manual_bg_${Date.now()}`;
    const res = await uploadBufferToCloudinaryPublic(processedBuffer, cleanId);

    let primary = ""; let secondary = ""; let tertiary = "";
    if (res.colors) {
      if (res.colors.primary) primary = res.colors.primary;
      if (res.colors.secondary) secondary = res.colors.secondary;
      if (res.colors.tertiary) tertiary = res.colors.tertiary;
    }

    await updateDoc(doc(db, "leads", docId), { logoUrl: res.url, primary: primary, secondary: secondary, tertiary: tertiary });
    return { success: true, url: res.url };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}