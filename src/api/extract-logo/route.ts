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

interface CloudinaryUploadResult {
    url: string;
    primaryColor: string | null;
    secondaryColor: string | null;
    tertiaryColor: string | null;
}

// ---------------------------------------------------------
// CLOUDINARY UPLOAD WITH COLOR EXTRACTION
// ---------------------------------------------------------
async function uploadToCloudinary(buffer: Buffer, publicId: string): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                public_id: publicId,
                folder: 'logos',
                overwrite: true,
                resource_type: 'auto',
                colors: true, // MAGIC: Cloudinary natively extracts dominant colors!
            },
            (error, result: any) => {
                if (error) return reject(error);
                if (!result) return reject(new Error("Upload failed"));

                // Add AVIF compression, trim, and transparency handling
                const optimizedUrl = result.secure_url.replace(
                    '/upload/',
                    '/upload/e_make_transparent:15,co_white/e_trim/f_avif,q_auto/'
                );

                // Cloudinary returns colors array like: [["#FFFFFF", 45.5], ["#000000", 20.1], ...]
                const extractedColors = result.colors || [];

                resolve({
                    url: optimizedUrl,
                    primaryColor: extractedColors[0]?.[0] || null,
                    secondaryColor: extractedColors[1]?.[0] || null,
                    tertiaryColor: extractedColors[2]?.[0] || null,
                });
            }
        );
        uploadStream.end(buffer);
    });
}

// ---------------------------------------------------------
// HIGHLY INTELLIGENT LOGO EXTRACTOR
// ---------------------------------------------------------
async function extractLogoUrlFromWebsite(websiteUrl: string, domain: string): Promise<string | null> {
    try {
        const secureUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
        const baseUrlNoSlash = secureUrl.replace(/\/$/, '');

        const response = await fetch(secureUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html',
            },
            signal: AbortSignal.timeout(8000) // 8-second timeout
        });

        if (!response.ok) throw new Error('Failed to fetch HTML');

        let html = await response.text();
        html = html.replace(/<noscript([^>]*)>/gi, '<div$1>').replace(/<\/noscript>/gi, '</div>');

        const $ = cheerio.load(html);
        let logoUrl: string | null = null;

        const getBestImageSrc = (imgEl: any): string | null => {
            let src = $(imgEl).attr('data-src') \vert{ }\vert{ }$(imgEl).attr('src');
            if (!src || src.startsWith('data:image')) {
                const srcset = $(imgEl).attr('srcset') \vert{ }\vert{ }$(imgEl).attr('data-srcset');
                if (srcset) {
                    src = srcset.split(',')[0].trim().split(' ')[0];
                }
            }
            if (src && src.startsWith('data:image')) return null;
            return src || null;
        };

        const isValidLogo = (url: string | null | undefined): boolean => {
            if (!url) return false;
            const lower = url.toLowerCase();
            return !BANNED_KEYWORDS.some(kw => lower.includes(kw));
        };

        // STRATEGY 1: MoeGo & Background Images (Catches <div style="background-image: url(...)">)
        // Runs first because if it's a MoeGo booking link, this is exactly where the logo lives.
        $('[style*="background-image"]').each((_, el) => {
            const style = $(el).attr('style') || '';
            // Regex handles normal quotes, single quotes, and escaped &quot; 
            const match = style.match(/url\(\s*(?:'\vert{}"\vert{}&quot;)?(.*?)(?:'\vert{}"\vert{}&quot;)?\s*\)/i);
            if (match && match[1]) {
                const src = match[1].trim();
                // Trust it blindly if it's MoeGo, otherwise run the standard validator
                if (domain.includes('moego.pet') || isValidLogo(src)) {
                    logoUrl = src;
                    return false; // Break loop
                }
            }
        });
        if (logoUrl) return resolveUrl(logoUrl, secureUrl);

        // STRATEGY 2: The "Home Link" Pattern
        $('a').each((_, a) => {
            const href = $(a).attr('href');
            if (!href) return;
            const cleanHref = href.split('?')[0].replace(/\/$/, '');
            const isHomeLink = cleanHref === '' || cleanHref === '/' || cleanHref === baseUrlNoSlash ||
                cleanHref.includes(domain);

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

        // STRATEGY 3: Alt Text Check
        $('img').each((_, img) => {
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

        // STRATEGY 4: Strict Attributes
        const targetedSelectors = ['img[class*="logo" i]', 'img[id*="logo" i]', '.site-logo img', '.navbar-brand img', 'header img'];
        for (const selector of targetedSelectors) {
            $(selector).each((_, img) => {
                const src = getBestImageSrc(img);
                if (isValidLogo(src)) {
                    logoUrl = src;
                    return false;
                }
            });
            if (logoUrl) break;
        }
        if (logoUrl) return resolveUrl(logoUrl, secureUrl);

        // STRATEGY 5: Open Graph Metadata
        const ogImage = $('meta[property="og:image"]').attr('content');
        if (isValidLogo(ogImage)) return resolveUrl(ogImage!, secureUrl);

        return null;

    } catch (err) {
        return null;
    }
}

function resolveUrl(rawUrl: string, baseUrl: string): string {
    if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
    if (rawUrl.startsWith('http')) return rawUrl;
    try {
        return new URL(rawUrl, baseUrl).href;
    } catch {
        return rawUrl;
    }
}

// ---------------------------------------------------------
// MAIN N8N ENDPOINT
// ---------------------------------------------------------
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { websiteUrl } = body;

        if (!websiteUrl) {
            return NextResponse.json({ success: false, error: "Missing 'websiteUrl' in request body." }, { status: 400 });
        }

        const urlObj = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
        const domain = urlObj.hostname.replace('www.', '');
        const cleanDomainForId = domain.replace(/\./g, '_');

        // 1. Scrape the URL
        const finalDownloadUrl = await extractLogoUrlFromWebsite(websiteUrl, domain);

        let imageResponse;

        // 2. Fetch the extracted image
        if (finalDownloadUrl) {
            imageResponse = await fetch(finalDownloadUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });
        }

        // 3. Fallbacks if scraping fails
        if (!imageResponse || !imageResponse.ok) {
            imageResponse = await fetch(`https://logo.clearbit.com/${domain}`, { signal: AbortSignal.timeout(5000) });
            if (!imageResponse.ok) {
                const textLogoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(domain)}&background=random&color=fff&size=512&format=png`;
                imageResponse = await fetch(textLogoUrl);
            }
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const finalBuffer = Buffer.from(arrayBuffer);

        // 4. Upload to Cloudinary (compresses to AVIF & extracts colors)
        const cloudinaryResult = await uploadToCloudinary(finalBuffer, cleanDomainForId);

        // 5. Return clean JSON directly to n8n
        return NextResponse.json({
            success: true,
            data: {
                website: websiteUrl,
                logoUrl: cloudinaryResult.url,
                colors: {
                    primary: cloudinaryResult.primaryColor,
                    secondary: cloudinaryResult.secondaryColor,
                    tertiary: cloudinaryResult.tertiaryColor
                }
            }
        });

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}