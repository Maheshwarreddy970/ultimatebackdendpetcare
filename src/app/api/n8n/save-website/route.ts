import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';

// 🔥 SMART CONTRAST CALCULATORS
function getContrastColor(hexColor: string) {
  if (!hexColor) return "#ffffff";
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) || 0;
  const g = parseInt(hex.substr(2, 2), 16) || 0;
  const b = parseInt(hex.substr(4, 2), 16) || 0;
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? "#1e0c05" : "#ffffff"; 
}

function isDarkColor(hexColor: string) {
  if (!hexColor) return false;
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) || 0;
  const g = parseInt(hex.substr(2, 2), 16) || 0;
  const b = parseInt(hex.substr(4, 2), 16) || 0;
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq < 128; 
}

export async function POST(req: Request) {
  try {
    const { email, aiData, logoUrl } = await req.json();
    if (!email || !aiData) return NextResponse.json({ success: false, error: "Missing data" }, { status: 400 });

    const docId = email.toLowerCase().trim();
    const leadDocRef = doc(db, "leads", docId);

    // 🔥 FETCH REAL DATA DIRECTLY FROM THE DATABASE (Phone, Facebook, Instagram)
    const leadDocSnap = await getDoc(leadDocRef);
    let realPhone = "Contact Us";
    let realFacebook = "#";
    let realInstagram = "#";
    let realAddress = aiData.address;

    if (leadDocSnap.exists()) {
      const dbData = leadDocSnap.data();
      
      // Grab real phone
      if (dbData.Phone) realPhone = dbData.Phone;
      else if (dbData.facebookphone) realPhone = dbData.facebookphone;

      // Grab real Facebook
      const fbRaw = dbData.Facebook || dbData.facebookurl || dbData.aifacebook || dbData["extracted facebook"];
      if (fbRaw && fbRaw.trim() !== "") {
        realFacebook = fbRaw.startsWith("http") ? fbRaw : `https://www.facebook.com/${fbRaw}`;
      }

      // Grab real Instagram
      const igRaw = dbData.Instagram;
      if (igRaw && igRaw.trim() !== "") {
        realInstagram = igRaw.startsWith("http") ? igRaw : `https://${igRaw}`;
      }
      
      // Ensure address is accurate
      if (!realAddress || realAddress.trim() === "") {
        realAddress = dbData.Address || dbData.facebookaddress || "";
      }
    }

    // Format Phone for href (strip non-numbers)
    const phoneHref = realPhone !== "Contact Us" ? `tel:${realPhone.replace(/[^0-9+]/g, '')}` : "#contact";

    // 🔥 COLOR ENGINE & FALLBACKS
    let pColor = aiData.primaryColor ? aiData.primaryColor.trim().toUpperCase() : "#2A2C2E";
    
    // Prevent pure White or pure Black as primary
    if (pColor === "#FFFFFF" || pColor === "#FFFFFE" || pColor === "#000000" || pColor === "#010101") {
      pColor = "#2A2C2E"; 
    }

    const darkText = "#1e0c05";
    const lightText = "#ffffff";
    const mutedText = "#625b5b";
    const bgLight = "#ffffff";
    const bgOffWhite = "#faf3ec";

    const btnTextColor = getContrastColor(pColor);
    const darkBgIconColor = isDarkColor(pColor) ? "#ffffff" : pColor;

    // 🔥 GENERATE UNIQUE SLUG
    let baseSlug = aiData.businessName.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
    baseSlug = baseSlug.replace(/-+/g, '-');
    let finalSlug = baseSlug;

    let slugSnap = await getDoc(doc(db, "websites", finalSlug));

    if (slugSnap.exists()) {
      const addressString = realAddress || "";
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

    const safeStatsHeading = aiData.statsHeading ? aiData.statsHeading.replace(/`/g, '') : "Our Commitment to Pet Wellness";

    // 🔥 BUILD THE PERFECT, FULLY-STYLED JSON STRUCTURE
    const websiteOneData = {
      theme: { primaryColor: pColor },
      navbar: {
        section: { bg: bgLight, className: "" },
        logo: { src: logoUrl, alt: `${aiData.businessName} Logo`, className: "" },
        styling: { linkColor: mutedText, linkHoverColor: darkText },
        cta: { label: aiData.navbarCta, href: "#contact", bg: pColor, text: btnTextColor, className: "" },
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
        image: { src: `https://nexpetcare.com/demowebsite/homepageimage.avif`, className: "", imagecolor: pColor },
        mobileImage: { src: `https://nexpetcare.com/demowebsite/heropageimagesmallscreen.avif`, className: "", imagecolor: pColor },
        cta: { label: aiData.heroCta, href: "#contact", bg: pColor, text: btnTextColor, className: "" },
        socialProof: { stars: 5, starColor: pColor, text: aiData.socialProof, textColor: darkText, className: "" }
      },
      statsBanner: {
        section: { bg: darkText, className: "" }, 
        heading: { text: safeStatsHeading, color: "#fdfdfd", className: "" }, 
        rating: { score: aiData.rating, max: "/5", scoreColor: "#fdfdfd", stars: 5, starColor: darkBgIconColor, label: `5-Star Reviews: ${aiData.reviews}`, labelColor: bgLight, className: "" },
        experience: { title: "Trusted Local Groomer", titleColor: "#fdfdfd", subtitle: realAddress, subColor: bgLight, iconColor: darkBgIconColor, className: "" }
      },
      imageSlider: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.sliderHeading, color: darkText, className: "" },
        description: { text: aiData.sliderDesc, color: mutedText, className: "" },
        items: [
          { image: `https://nexpetcare.com/demowebsite/1.avif`, alt: "Happy Pet 1", className: "" },
          { image: `https://nexpetcare.com/demowebsite/2.avif`, alt: "Happy Pet 2", className: "" },
          { image: `https://nexpetcare.com/demowebsite/3.avif`, alt: "Happy Pet 3", className: "" },
          { image: `https://nexpetcare.com/demowebsite/4.avif`, alt: "Happy Pet 4", className: "" },
          { image: `https://nexpetcare.com/demowebsite/5.avif`, alt: "Happy Pet 5", className: "" },
          { image: `https://nexpetcare.com/demowebsite/6.avif`, alt: "Happy Pet 6", className: "" }
        ]
      },
      gallery: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.galleryHeading, color: darkText, className: "" },
        description: { text: aiData.galleryDesc, color: mutedText, className: "" },
        styling: { arrowColor: pColor, badgeBg: bgOffWhite, badgeText: darkText, className: "" },
        items: [
          { id: 1, before: `https://nexpetcare.com/demowebsite/b1.avif`, after: `https://nexpetcare.com/demowebsite/a1.avif`, alt: "Dog grooming", className: "" },
          { id: 2, before: `https://nexpetcare.com/demowebsite/b2.avif`, after: `https://nexpetcare.com/demowebsite/a2.avif`, alt: "Cat grooming", className: "" },
          { id: 3, before: `https://nexpetcare.com/demowebsite/b3.avif`, after: `https://nexpetcare.com/demowebsite/a3.avif`, alt: "Pet styling", className: "" }
        ]
      },
      about: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.aboutHeading, color: darkText, className: "" },
        description: { text: aiData.aboutDesc, color: mutedText, className: "" },
        image: { src: `https://nexpetcare.com/demowebsite/about.avif`, className: "", imagecolor: pColor },
        featuresList: { features: aiData.aboutFeatures, featureColor: darkText, featureIconColor: pColor, className: "" },
        cta: { label: "More About Us", href: "#", bg: pColor, text: btnTextColor, className: "" }
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
        cta: { label: "View All Services", href: "#services", bg: pColor, text: btnTextColor, className: "" }
      },
      process: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.processHeading, color: darkText, className: "" },
        description: { text: aiData.processDesc, color: mutedText, className: "" },
        styling: { lineColor: pColor, className: "" },
        steps: [
          { id: "01", title: "Book your appointment", titleColor: darkText, description: "Pick the service you want and book a convenient time.", descColor: mutedText, image: `https://nexpetcare.com/demowebsite/step1.avif`, className: "" },
          { id: "02", title: "Drop off your pet", titleColor: darkText, description: "Drop by our friendly studio with your pet at your appointment time.", descColor: mutedText, image: `https://nexpetcare.com/demowebsite/step2.avif`, className: "" },
          { id: "03", title: "Pick up a happy pet", titleColor: darkText, description: "Grab your freshly groomed, happy pup and enjoy the results!", descColor: mutedText, image: `https://nexpetcare.com/demowebsite/step3.avif`, className: "" }
        ]
      },
      comparison: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.comparisonHeading, color: darkText, className: "" },
        description: { text: aiData.comparisonDesc, color: mutedText, className: "" },
        // 🔥 HIGH CONTRAST VS BADGE FIX: Dark Background, White Text
        vsBadge: { bg: darkText, text: "#ffffff", className: "" },
        leftColumn: { bg: bgOffWhite, textColor: mutedText, iconColor: mutedText, offers: ["Untrained or uncertified staff", "Harsh chemicals and poor products", "Stressful, noisy pet environment", "No updates during your pet's session", "One-size-fits-all service packages", "Inconsistent results every visit"], className: "" },
        rightColumn: { bg: pColor, textColor: btnTextColor, iconColor: btnTextColor, offers: ["Certified, professional groomers", "100% pet-safe, eco-friendly products", "Calm, welcoming, stress-free space", "Real-time session updates", "Flexible packages for your pet", "Premium quality every visit"], className: "" }
      },
      reviews: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.reviewsHeading, color: darkText, className: "" },
        description: { text: aiData.reviewsDesc, color: mutedText, className: "" },
        columns: {
          col1: [
            { type: "review", name: "David Chen", role: "Dog Owner", text: "“I was kinda nervous about taking Luna for grooming, but they totally relaxed her and made the experience enjoyable.”", avatar: `https://nexpetcare.com/demowebsite/person1.webp`, bg: bgOffWhite, textColor: mutedText, titleColor: darkText, starColor: pColor },
            { type: "stat-numeric", score: aiData.rating, scale: "/5", subtext: `Trusted by ${aiData.reviews} owners`, bg: pColor, scoreColor: btnTextColor, textColor: btnTextColor, starColor: btnTextColor }
          ],
          col2: [
            { type: "review", name: "James Thornton", role: "Dog Owner", text: "“They truly transformed my golden retriever, Max! He looked amazing and was happy the whole time. Exceptional care.”", avatar: `https://nexpetcare.com/demowebsite/person2.webp`, bg: bgOffWhite, textColor: mutedText, titleColor: darkText, starColor: pColor }
          ],
          col3: [
            { type: "stat-image", image: `https://nexpetcare.com/demowebsite/reviewcard.avif`, heading: "100%", subtext: "Satisfaction Guaranteed", bg: pColor, textColor: btnTextColor, iconColor: btnTextColor },
            { type: "review", name: "Marcus Williams", role: "Cat Owner", text: "“As someone who owns three pets, I need a groomer I can fully trust. These guys are the absolute best.”", avatar: `https://nexpetcare.com/demowebsite/person3.webp`, bg: bgOffWhite, textColor: mutedText, titleColor: darkText, starColor: pColor }
          ]
        }
      },
      insights: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.insightsHeading, color: darkText, className: "" },
        description: { text: aiData.insightsDesc, color: mutedText, className: "" },
        styling: { cardBg: bgLight, cardTitle: darkText, cardDateBg: bgOffWhite, cardDateText: mutedText, className: "" },
        items: [
          { id: 1, title: "5 Signs your pet needs grooming help", date: "Recent", image: `https://nexpetcare.com/demowebsite/blog1.avif`, className: "" },
          { id: 2, title: "How often do usually groom your dog?", date: "Recent", image: `https://nexpetcare.com/demowebsite/blog2.avif`, className: "" },
          { id: 3, title: "Keeping your pet calm during grooming", date: "Recent", image: `https://nexpetcare.com/demowebsite/blog3.avif`, className: "" }
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
        button: { label: "Send Message", bg: pColor, text: btnTextColor, className: "" }
      },
      ctaSection: {
        section: { bg: bgOffWhite, className: "" },
        heading: { text: aiData.finalCtaHeading, color: darkText, className: "" },
        description: { text: aiData.finalCtaDesc, color: mutedText, className: "" },
        image: { src: `https://nexpetcare.com/demowebsite/cta.avif`, className: "" },
        cta: { label: "Book Appointment", href: "#contact", bg: pColor, text: btnTextColor, className: "" }
      },
      
      // 🔥 HIGHLY CUSTOMIZED FOOTER WITH REAL DATABASE LINKS AND MAP
      footer: {
        section: { bg: "#fdfdfd", className: "" },
        logo: { src: logoUrl, alt: `${aiData.businessName} Logo`, className: "" },
        styling: { textColor: darkText, mutedColor: mutedText, iconBg: pColor, iconText: btnTextColor },
        disclaimer: "The information provided on this website is for general informational purposes only. We are dedicated to providing the highest quality care, but please consult with our staff regarding your pet's specific health and grooming needs.",
        quickLinks: [
          { label: "Home", href: "#home" },
          { label: "Services", href: "#services" },
          { label: "Gallery", href: "#gallery" },
          { label: "Reviews", href: "#reviews" },
          { label: "FAQ", href: "#faq" }
        ],
        legalLinks: [
          { label: "Privacy Policy", href: "#" },
          { label: "Terms of Service", href: "#" },
          { label: "Cancellation Policy", href: "#" }
        ],
        info: {
          address: realAddress,
          phone: { label: realPhone, href: phoneHref },
          email: { label: email, href: `mailto:${email}` },
          // 🔥 REAL EMBED URL INJECTED HERE
          mapEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d79843.50769875153!2d2.2482248676731413!3d48.85836229464928!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47e66e2964e34e2d%3A0x8ddca9ee380ef7e0!2sEiffel%20Tower!5e1!3m2!1sen!2sin!4v1790962482457!5m2!1sen!2sin",
          // 🔥 STOREFRONT IMAGE UPDATED
          storefrontImage: { src: "https://nexpetcare.com/demowebsite/storeimage.avif" }
        },
        copyright: `Copyright © ${new Date().getFullYear()} ${aiData.businessName}. All rights reserved.`,
        socials: { facebook: realFacebook, instagram: realInstagram }
      }
    };

    // 🔥 CREATE THE NEW WEBSITE DOCUMENT IN THE 'websites' COLLECTION
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

    // 🔥 UPDATE THE LEAD TO LINK IT TO THE NEW WEBSITE
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