import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: 'dyn40clci',
  api_key: '328476136325637',
  api_secret: 'a7MiQt_aMZfhuCe2891nUdgJDVs',
});

const BANNED_KEYWORDS = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'google', 'placeholder', 'spinner'];

// ---------------------------------------------------------
// CLOUDINARY UPLOADER & COLOR EXTRACTOR
// ---------------------------------------------------------
async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: 'logos',
        overwrite: true,
        resource_type: 'auto',
        colors: true // 🔥 THIS TELLS CLOUDINARY TO EXTRACT DOMINANT COLORS
      },
      (error: any, result: any) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed"));

        // Add transformations: 
        // 1. f_avif -> Convert to modern AVIF format
        // 2. q_auto:best -> Do not decrease quality. Use the highest visual fidelity possible.
        // NOTE: Background removal (e_make_transparent) and cropping (e_trim) have been REMOVED.
        const optimizedUrl = result.secure_url.replace(
          '/upload/',
          '/upload/f_avif,q_auto:best/'
        );

        // Extract the Top 3 colors from Cloudinary's response
        let primary = null, secondary = null, tertiary = null;

        if (result.colors && result.colors.length > 0) {
          // Cloudinary returns arrays like: [ [ '#FFFFFF', 45.5 ], [ '#000000', 30.2 ] ]
          primary = result.colors[0]?.[0] || null;
          secondary = result.colors[1]?.[0] || null;
          tertiary = result.colors[2]?.[0] || null;
        }

        resolve({
          url: optimizedUrl,
          colors: { primary, secondary, tertiary }
        });
      }
    );
    uploadStream.end(buffer);
  });
}

// ---------------------------------------------------------
// THE NEW, HIGHLY INTELLIGENT LOGO EXTRACTOR
// ---------------------------------------------------------
async function extractLogoUrlFromWebsite(websiteUrl: string, domain: string): Promise<string | null> {
  try {
    const secureUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    const baseUrlNoSlash = secureUrl.replace(/\/$/, '');

    const response = await fetch(secureUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) throw new Error('Failed to fetch HTML');

    let html = await response.text();

    // FIX 1: Unwrap <noscript> tags
    html = html.replace(/<noscript([^>]*)>/gi, '<div$1>').replace(/<\/noscript>/gi, '</div>');

    const $ = cheerio.load(html);
    let logoUrl: string | null = null;

    // Helper: Safely extract real image URL (Fixed the || glitch here)
    // Helper: Safely extract real image URL
    const getBestImageSrc = (imgEl: any): string | null => {
      let src = $(imgEl).attr('data-src') || $(imgEl).attr('src');

      if (!src || src.startsWith('data:image')) {
        const srcset = $(imgEl).attr('srcset') || $(imgEl).attr('data-srcset');
        if (srcset) {
          src = srcset.split(',')[0].trim().split(' ')[0];
        }
      }

      if (src && src.startsWith('data:image')) return null;
      return src || null;
    };

    // Helper: Validate URL
    const isValidLogo = (url: string | null | undefined): boolean => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return !BANNED_KEYWORDS.some(kw => lower.includes(kw));
    };

    // --- STRATEGY 0: MOEGO SPECIFIC & BACKGROUND IMAGES ---
    $('[style*="background-image"]').each((_: any, el: any) => {
      const style = $(el).attr('style') || '';
      // Extract URL from style="background-image: url(...)"
      const match = style.match(/background-image:\s*url\s*\(\s*(.*?)\s*\)/i);

      if (match && match[1]) {
        // Clean up &quot; and quotes
        let src = match[1].replace(/&quot;/g, '').replace(/^['"]|['"]$/g, '');

        if (isValidLogo(src)) {
          // If it's Moego, we aggressively assume this is the logo
          if (domain.includes('moego')) {
            logoUrl = src;
            return false; // Break loop
          }

          // Otherwise, only grab it if the div has 'logo' in class or ID
          const className = $(el).attr('class') || '';
          const id = $(el).attr('id') || '';
          if (className.toLowerCase().includes('logo') || id.toLowerCase().includes('logo')) {
            logoUrl = src;
            return false;
          }
        }
      }
    });

    if (logoUrl) return resolveUrl(logoUrl, secureUrl);

    // --- STRATEGY 0.5: MOEGO JS PAYLOAD FALLBACK ---
    if (domain.includes('moego')) {
      const rawS3Match = html.match(/https:\/\/moegonew\.s3[^"'\\]+\.(jpeg|jpg|png|webp|avif)/i);
      if (rawS3Match) return resolveUrl(rawS3Match[0], secureUrl);
    }

    // --- STRATEGY 1: The "Home Link" Pattern ---
    $('a').each((_: any, a: any) => {
      const href = $(a).attr('href');
      if (!href) return;

      const cleanHref = href.split('?')[0].replace(/\/$/, '');
      const isHomeLink = cleanHref === '' || cleanHref === '/' || cleanHref === baseUrlNoSlash ||
        cleanHref === `http://${domain}` || cleanHref === `https://${domain}` ||
        cleanHref === `http://www.${domain}` || cleanHref === `https://www.${domain}`;

      if (isHomeLink) {
        const img = $(a).find('img').first();
        if (img.length > 0) {
          const src = getBestImageSrc(img[0]);
          if (isValidLogo(src)) {
            logoUrl = src;
            return false;
          }
        }
      }
    });

    if (logoUrl) return resolveUrl(logoUrl, secureUrl);

    // --- STRATEGY 2: Manual Alt Text Check ---
    $('img').each((_: any, img: any) => {
      const alt = $(img).attr('alt') || '';
      if (alt.toLowerCase().includes('logo')) {
        const src = getBestImageSrc(img);
        if (isValidLogo(src)) {
          logoUrl = src;
          return false;
        }
      }
    });

    if (logoUrl) return resolveUrl(logoUrl, secureUrl);

    // --- STRATEGY 3: Strict Attributes & Class Names ---
    const targetedSelectors = [
      'img[class*="logo" i]', 'img[id*="logo" i]', '.site-logo img',
      '.navbar-brand img', 'header img', '[class*="header"] img'
    ];

    for (const selector of targetedSelectors) {
      $(selector).each((_: any, img: any) => {
        const src = getBestImageSrc(img);
        if (isValidLogo(src)) {
          logoUrl = src;
          return false;
        }
      });
      if (logoUrl) break;
    }

    if (logoUrl) return resolveUrl(logoUrl, secureUrl);

    // --- STRATEGY 4: Open Graph Metadata ---
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (isValidLogo(ogImage)) return resolveUrl(ogImage!, secureUrl);

    return null;

  } catch (err) {
    return null;
  }
}

// Helper to resolve relative URLs
function resolveUrl(rawUrl: string, baseUrl: string): string {
  if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
  if (rawUrl.startsWith('http')) return rawUrl;
  try { return new URL(rawUrl, baseUrl).href; } catch { return rawUrl; }
}

// ---------------------------------------------------------
// MAIN API ENDPOINT (For n8n)
// ---------------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const websiteUrl = body.websiteUrl;

    if (!websiteUrl) {
      return NextResponse.json({ success: false, error: "websiteUrl is required" }, { status: 400 });
    }

    const urlObj = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    const domain = urlObj.hostname.replace('www.', '');
    const cleanDomainForId = domain.replace(/\./g, '_') + '_' + Date.now(); // Ensures unique upload

    console.log(`Extracting logo for: ${domain}`);

    const finalDownloadUrl = await extractLogoUrlFromWebsite(websiteUrl, domain);
    let imageResponse: any;

    if (finalDownloadUrl) {
      try {
        imageResponse = await fetch(finalDownloadUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000)
        });
      } catch (e) {
        console.log("Primary extraction fetch failed, moving to fallback.");
      }
    }

    // ---------------------------------------------------------
    // NEW, CRASH-PROOF FALLBACK LOGIC
    // ---------------------------------------------------------
    if (!imageResponse || !imageResponse.ok) {
      try {
        // Fallback 1: Google's High-Res Favicon API (Replaces dead Clearbit)
        imageResponse = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=256`, {
          signal: AbortSignal.timeout(5000)
        });

        if (!imageResponse.ok) throw new Error("Google Favicon failed");
      } catch (fallbackErr) {
        // Fallback 2: UI Avatars (If Google fails or network crashes)
        const textLogoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(domain)}&background=random&color=fff&size=512&format=png`;
        imageResponse = await fetch(textLogoUrl);
      }
    }

    // Ensure we actually got an image before converting to buffer
    if (!imageResponse || !imageResponse.ok) {
      return NextResponse.json({ success: false, error: "All logo extraction methods failed." }, { status: 404 });
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const finalBuffer = Buffer.from(arrayBuffer);

    // Upload to Cloudinary (which converts to AVIF & extracts colors)
    const cloudinaryData = await uploadToCloudinary(finalBuffer, cleanDomainForId);

    // Return the response back to n8n
    return NextResponse.json({
      success: true,
      website: websiteUrl,
      logoUrl: cloudinaryData.url,
      colors: cloudinaryData.colors
    });

  } catch (error: any) {
    console.error("Worker Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}