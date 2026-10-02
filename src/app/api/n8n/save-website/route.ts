import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';

// Helper function to mathematically calculate color brightness
function getBrightness(hex: string) {
  let cleanHex = hex.replace(/^#/, '');
  if (cleanHex.length === 3) cleanHex = cleanHex.split('').map(c => c + c).join('');
  const r = parseInt(cleanHex.slice(0, 2), 16) || 0;
  const g = parseInt(cleanHex.slice(2, 4), 16) || 0;
  const b = parseInt(cleanHex.slice(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

export async function POST(req: Request) {
  try {
    const { email, aiData, logoUrl } = await req.json();
    if (!email || !aiData) return NextResponse.json({ success: false, error: "Missing data" }, { status: 400 });

    const docId = email.toLowerCase().trim();
    const leadDocRef = doc(db, "leads", docId);

    // -------------------------------------------------------------
    // 🔥 SMART COLOR CONTRAST ENGINE
    // -------------------------------------------------------------
    let pColor = aiData.primaryColor ? aiData.primaryColor : "#a35c38";
    
    // If the AI provides pure white or a color that is way too light, text highlighting will be invisible on a white background. 
    // We override it with a premium Deep Mocha/Charcoal.
    if (getBrightness(pColor) > 230) {
      pColor = "#2A2C2E"; 
    }

    const brightness = getBrightness(pColor);
    const isPrimaryDark = brightness < 120;
    const isPrimaryLight = brightness > 180;

    const darkText = "#1e0c05";
    const lightText = "#ffffff";
    const mutedText = "#625b5b";
    const bgLight = "#ffffff";
    const bgOffWhite = "#faf3ec";

    // Dynamic contrast rules to prevent invisible elements
    const buttonTextColor = isPrimaryLight ? darkText : lightText;
    const rightColTextColor = isPrimaryLight ? darkText : lightText;
    
    // Stats Banner is Dark (#1e0c05). If primary is also dark, stars & icons will vanish!
    const statsBannerStarColor = isPrimaryDark ? "#FACC15" : pColor; // Gold stars if pColor is dark!
    const statsBannerIconColor = isPrimaryDark ? lightText : pColor; // White icons if pColor is dark!


    // -------------------------------------------------------------
    // 🔥 1. GENERATE CLEAN BASE SLUG
    // -------------------------------------------------------------
    let baseSlug = aiData.businessName
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();
      
    baseSlug = baseSlug.replace(/-+/g, '-');
    let finalSlug = baseSlug;

    // 🔥 2. CHECK IF SLUG ALREADY EXISTS
    let slugSnap = await getDoc(doc(db, "websites", finalSlug));

    if (slugSnap.exists()) {
      const addressString = aiData.address || "";
      const addressParts = addressString.split(',').map((p: string) => p.trim());
      
      let locationModifier = "petcare"; 
      if (addressParts.length > 2) locationModifier = addressParts[1];
      else if (addressParts.length === 2) locationModifier = addressParts[0];
      else if (addressParts.length === 1 && addressParts[0]) locationModifier = addressParts[0];

      const cleanLocation = locationModifier.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
      finalSlug = `${baseSlug}-${cleanLocation}`.replace(/-+/g, '-');

      const doubleCheckSnap = await getDoc(doc(db, "websites", finalSlug));
      if (doubleCheckSnap.exists()) finalSlug = `${finalSlug}-grooming`; 
    }

    // -------------------------------------------------------------
    // 🔥 3. BUILD THE SPECIFIC websiteOneData STRUCTURE
    // -------------------------------------------------------------
    const websiteOneData = {
      theme: { primaryColor: pColor },
      navbar: {
        section: { bg: bgLight, className: "" },
        logo: { src: logoUrl, alt: `${aiData.businessName} Logo`, className: "" },
        styling: { linkColor: mutedText, linkHoverColor: darkText },
        cta: { label: aiData.navbarCta, href: "#contact", bg: pColor, text: buttonTextColor, className: "" },
        links: [
          { label: "Home", href: "#home", icon: "Home", className: "" },
          { label: "Gallery", href: "#gallery", icon: "Calendar", className: "" },
          { label: "Services", href: "#services", icon: "Briefcase", className: "" },
          { label: "Process", href: "#process", icon: "Dog", className: "" },
          { label: "Reviews", href: "#reviews", icon: "Reviews", className: "" },
          { label: "FAQ", href: "#faq", icon: "MessageSquare", className: "" }
        ]
      },
      hero: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.heroHeading, color: darkText, className: "" },
        description: { text: aiData.heroDesc, color: darkText, className: "" },
        image: { src: `/demowebsite/homepageimage.avif`, className: "", imagecolor: pColor },
        mobileImage: { src: `/demowebsite/heropageimagesmallscreen.avif`, className: "", imagecolor: pColor },
        cta: { label: aiData.heroCta, href: "#contact", bg: pColor, text: buttonTextColor, className: "" },
        socialProof: { stars: 5, starColor: pColor, text: aiData.socialProof, textColor: darkText, className: "" }
      },
      statsBanner: {
        section: { bg: darkText, className: "" },
        heading: { text: aiData.statsHeading, color: "#fdfdfd", className: "" },
        // Applied Smart Contrast Here:
        rating: { score: aiData.rating, max: "/5", scoreColor: "#fdfdfd", stars: 5, starColor: statsBannerStarColor, label: `5-Star Reviews: ${aiData.reviews}`, labelColor: bgLight, className: "" },
        experience: { title: "Trusted Local Groomer", titleColor: "#fdfdfd", subtitle: aiData.address, subColor: bgLight, iconColor: statsBannerIconColor, className: "" }
      },
      imageSlider: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.sliderHeading, color: darkText, className: "" },
        description: { text: aiData.sliderDesc, color: mutedText, className: "" },
        items: [
          { image: `/demowebsite/1.avif`, alt: "Happy Pet 1", className: "" },
          { image: `/demowebsite/2.avif`, alt: "Happy Pet 2", className: "" },
          { image: `/demowebsite/3.avif`, alt: "Happy Pet 3", className: "" },
          { image: `/demowebsite/4.avif`, alt: "Happy Pet 4", className: "" },
          { image: `/demowebsite/5.avif`, alt: "Happy Pet 5", className: "" },
          { image: `/demowebsite/6.avif`, alt: "Happy Pet 6", className: "" }
        ]
      },
      gallery: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.galleryHeading, color: darkText, className: "" },
        description: { text: aiData.galleryDesc, color: mutedText, className: "" },
        styling: { arrowColor: pColor, badgeBg: bgOffWhite, badgeText: darkText, className: "" },
        items: [
          { id: 1, before: `/demowebsite/b1.avif`, after: `/demowebsite/a1.avif`, alt: "Dog grooming", className: "" },
          { id: 2, before: `/demowebsite/b2.avif`, after: `/demowebsite/a2.avif`, alt: "Cat grooming", className: "" },
          { id: 3, before: `/demowebsite/b3.avif`, after: `/demowebsite/a3.avif`, alt: "Pet styling", className: "" }
        ]
      },
      about: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.aboutHeading, color: darkText, className: "" },
        description: { text: aiData.aboutDesc, color: mutedText, className: "" },
        image: { src: `/demowebsite/about.avif`, className: "", imagecolor: pColor },
        featuresList: { features: aiData.aboutFeatures, featureColor: darkText, featureIconColor: pColor, className: "" },
        cta: { label: "More About Us", href: "#", bg: pColor, text: buttonTextColor, className: "" }
      },
      services: {
        section: { bg: bgOffWhite, className: "" },
        heading: { text: aiData.servicesHeading, color: darkText, className: "" },
        description: { text: aiData.servicesDesc, color: mutedText, className: "" },
        styling: { cardBg: bgLight, cardBorder: "#ece5de", iconColor: pColor, titleColor: darkText, priceColor: darkText, className: "" },
        items: [
          { title: "Full body grooming", description: "Complete pampering from head to tail—bath, dry, trim, and style all taken care of.", priceLabel: "Premium Care", iconKey: "grooming", href: "#contact", ctaLabel: "Book Now", className: "" },
          { title: "Bath & blow dry", description: "Deep cleansing bath premium a professional blow dry finish included.", priceLabel: "Refresh", iconKey: "bath", href: "#contact", ctaLabel: "Book Now", className: "" },
          { title: "Haircut & styling", description: "Custom cuts and fun styles that totally match your pet's unique vibe perfectly.", priceLabel: "Styling", iconKey: "scissor", href: "#contact", ctaLabel: "Book Now", className: "" },
          { title: "Nail trimming", description: "Safe and precise nail clipping to keep your pet comfortable and healthy always.", priceLabel: "Maintenance", iconKey: "nail", href: "#contact", ctaLabel: "Book Now", className: "" }
        ],
        cta: { label: "View All Services", href: "#services", bg: pColor, text: buttonTextColor, className: "" }
      },
      process: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.processHeading, color: darkText, className: "" },
        description: { text: aiData.processDesc, color: mutedText, className: "" },
        styling: { lineColor: pColor, className: "" },
        steps: [
          { id: "01", title: "Book your appointment", titleColor: darkText, description: "Pick the service you want and book a convenient time.", descColor: mutedText, image: `/demowebsite/step1.avif`, className: "" },
          { id: "02", title: "Drop off your pet", titleColor: darkText, description: "Drop by our friendly studio with your pet at your appointment time.", descColor: mutedText, image: `/demowebsite/step2.avif`, className: "" },
          { id: "03", title: "Pick up a happy pet", titleColor: darkText, description: "Grab your freshly groomed, happy pup and enjoy the results!", descColor: mutedText, image: `/demowebsite/step3.avif`, className: "" }
        ]
      },
      comparison: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.comparisonHeading, color: darkText, className: "" },
        description: { text: aiData.comparisonDesc, color: mutedText, className: "" },
        vsBadge: { bg: pColor, text: buttonTextColor, className: "" },
        leftColumn: { bg: bgOffWhite, textColor: mutedText, iconColor: mutedText, offers: ["Untrained or uncertified staff", "Harsh chemicals and poor products", "Stressful, noisy pet environment", "No updates during your pet's session", "One-size-fits-all service packages", "Inconsistent results every visit"], className: "" },
        // Applied Smart Contrast Here:
        rightColumn: { bg: pColor, textColor: rightColTextColor, iconColor: rightColTextColor, offers: ["Certified, professional groomers", "100% pet-safe, eco-friendly products", "Calm, welcoming, stress-free space", "Real-time session updates", "Flexible packages for your pet", "Premium quality every visit"], className: "" }
      },
      reviews: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.reviewsHeading, color: darkText, className: "" },
        description: { text: aiData.reviewsDesc, color: mutedText, className: "" },
        columns: {
          col1: [
            { type: "review", name: "David Chen", role: "Dog Owner", text: "“I was kinda nervous about taking Luna for grooming, but they totally relaxed her and made the experience enjoyable.”", avatar: `/demowebsite/person1.webp`, bg: bgOffWhite, textColor: mutedText, titleColor: darkText, starColor: pColor },
            { type: "stat-numeric", score: aiData.rating, scale: "/5", subtext: `Trusted by ${aiData.reviews} owners`, bg: pColor, scoreColor: rightColTextColor, textColor: rightColTextColor, starColor: rightColTextColor }
          ],
          col2: [
            { type: "review", name: "James Thornton", role: "Dog Owner", text: "“They truly transformed my golden retriever, Max! He looked amazing and was happy the whole time. Exceptional care.”", avatar: `/demowebsite/person2.webp`, bg: bgOffWhite, textColor: mutedText, titleColor: darkText, starColor: pColor }
          ],
          col3: [
            { type: "stat-image", image: `/demowebsite/reviewcard.avif`, heading: "100%", subtext: "Satisfaction Guaranteed", bg: pColor, textColor: rightColTextColor, iconColor: rightColTextColor },
            { type: "review", name: "Marcus Williams", role: "Cat Owner", text: "“As someone who owns three pets, I need a groomer I can fully trust. These guys are the absolute best.”", avatar: `/demowebsite/person3.webp`, bg: bgOffWhite, textColor: mutedText, titleColor: darkText, starColor: pColor }
          ]
        }
      },
      insights: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.insightsHeading, color: darkText, className: "" },
        description: { text: aiData.insightsDesc, color: mutedText, className: "" },
        styling: { cardBg: bgLight, cardTitle: darkText, cardDateBg: bgOffWhite, cardDateText: mutedText, className: "" },
        items: [
          { id: 1, title: "5 Signs your pet needs grooming help", date: "Recent", image: `/demowebsite/blog1.avif`, className: "" },
          { id: 2, title: "How often do usually groom your dog?", date: "Recent", image: `/demowebsite/blog2.avif`, className: "" },
          { id: 3, title: "Keeping your pet calm during grooming", date: "Recent", image: `/demowebsite/blog3.avif`, className: "" }
        ]
      },
      faq: {
        section: { bg: bgOffWhite, className: "" },
        heading: { text: aiData.faqHeading, color: darkText, className: "" },
        description: { text: aiData.faqDesc, color: mutedText, className: "" },
        styling: { questionColor: darkText, answerColor: mutedText, iconColor: pColor, dividerColor: "#ece5de", className: "" },
        items: [
          { question: "Do you use sedation or anesthesia?", answer: "No! We use a completely natural, gentle approach using calming techniques to keep your pet relaxed and comfortable.", className: "" },
          { question: "How long does the appointment take?", answer: "A standard appointment takes about 45 to 60 minutes, but we never rush. If your pet needs more time to relax, we give it to them.", className: "" },
          { question: "Is this safe for senior pets?", answer: "Absolutely. Because we don't use anesthesia, our service is highly recommended for senior pets or pets with health conditions.", className: "" }
        ]
      },
      contactSection: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.contactHeading, color: darkText, className: "" },
        description: { text: aiData.contactDesc, color: mutedText, className: "" },
        button: { label: "Send Message", bg: pColor, text: buttonTextColor, className: "" }
      },
      ctaSection: {
        section: { bg: bgOffWhite, className: "" },
        heading: { text: aiData.finalCtaHeading, color: darkText, className: "" },
        description: { text: aiData.finalCtaDesc, color: mutedText, className: "" },
        image: { src: `/demowebsite/cta.avif`, className: "" },
        cta: { label: "Book Appointment", href: "#contact", bg: pColor, text: buttonTextColor, className: "" }
      },
      footer: {
        section: { bg: "#fdfdfd", className: "" },
        logo: { src: logoUrl, alt: `${aiData.businessName} Logo`, className: "" },
        styling: { textColor: darkText, mutedColor: mutedText, iconBg: pColor, iconText: buttonTextColor },
        info: {
          address: aiData.address,
          phone: { label: "Contact Us", href: `#contact` },
          email: { label: email, href: `mailto:${email}` },
          mapEmbedUrl: "",
        },
        copyright: `Copyright © ${new Date().getFullYear()} ${aiData.businessName}. All rights reserved.`,
        socials: { facebook: "#", instagram: "#" }
      }
    };

    const websiteDocData = {
      slug: finalSlug,
      ownerEmail: email,
      clientName: aiData.businessName,
      isDeployed: true,
      customDomain: "",
      domainStatus: "none",
      template: "websiteOne",
      lastUpdated: new Date().toISOString(),
      websiteOneData: websiteOneData
    };

    const websiteDocRef = doc(db, "websites", finalSlug);
    await setDoc(websiteDocRef, websiteDocData);

    await updateDoc(leadDocRef, {
      websiteSlug: finalSlug,
      websiteGeneratedAt: new Date().toISOString()
    });

    return NextResponse.json({ 
      success: true, 
      slug: finalSlug, 
      url: `${finalSlug}.nexpetcare.com`,
      message: "Website configured and saved successfully." 
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}