import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';

export async function POST(req: Request) {
  try {
    const { email, aiData, logoUrl } = await req.json();
    if (!email || !aiData) return NextResponse.json({ success: false, error: "Missing data" }, { status: 400 });

    const docId = email.toLowerCase().trim();
    const leadRef = doc(db, "leads", docId);

    const pColor = aiData.primaryColor ? aiData.primaryColor : "#a35c38";
    const darkText = "#1e0c05";
    const lightText = "#ffffff";
    const mutedText = "#625b5b";
    const bgLight = "#ffffff";
    const bgOffWhite = "#faf3ec";

    // 🔥 1. GENERATE UNIQUE SLUG (e.g., "panola-poodles-8392")
    const cleanName = aiData.businessName.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const uniqueSlug = `${cleanName}-${randomNum}`;

    // 🔥 2. BUILD THE WEBSITE JSON
    const websiteData = {
      leadEmail: docId, // Link back to the lead
      slug: uniqueSlug,
      createdAt: new Date().toISOString(),
      theme: { primaryColor: pColor },
      navbar: {
        section: { bg: bgLight, className: "" },
        logo: { src: logoUrl, alt: `${aiData.businessName} Logo`, className: "" },
        styling: { linkColor: mutedText, linkHoverColor: darkText },
        cta: { label: aiData.navbarCta, href: "#contact", bg: pColor, text: lightText, className: "" },
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
        cta: { label: aiData.heroCta, href: "#contact", bg: pColor, text: lightText, className: "" },
        socialProof: { stars: 5, starColor: pColor, text: aiData.socialProof, textColor: darkText, className: "" }
      },
      statsBanner: {
        section: { bg: darkText, className: "" },
        heading: { text: aiData.statsHeading, color: "#fdfdfd", className: "" },
        rating: { score: aiData.rating, max: "/5", scoreColor: "#fdfdfd", stars: 5, starColor: pColor, label: `5-Star Reviews: ${aiData.reviews}`, labelColor: bgLight, className: "" },
        experience: { title: "Trusted Local Groomer", titleColor: "#fdfdfd", subtitle: aiData.address, subColor: bgLight, iconColor: pColor, className: "" }
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
        cta: { label: "More About Us", href: "#", bg: pColor, text: lightText, className: "" }
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
        cta: { label: "View All Services", href: "#services", bg: pColor, text: lightText, className: "" }
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
        vsBadge: { bg: pColor, text: lightText, className: "" },
        leftColumn: { bg: bgOffWhite, textColor: mutedText, iconColor: mutedText, offers: ["Untrained or uncertified staff", "Harsh chemicals and poor products", "Stressful, noisy pet environment", "No updates during your pet's session", "One-size-fits-all service packages", "Inconsistent results every visit"], className: "" },
        rightColumn: { bg: pColor, textColor: lightText, iconColor: lightText, offers: ["Certified, professional groomers", "100% pet-safe, eco-friendly products", "Calm, welcoming, stress-free space", "Real-time session updates", "Flexible packages for your pet", "Premium quality every visit"], className: "" }
      },
      reviews: {
        section: { bg: bgLight, className: "" },
        heading: { text: aiData.reviewsHeading, color: darkText, className: "" },
        description: { text: aiData.reviewsDesc, color: mutedText, className: "" },
        columns: {
          col1: [
            { type: "review", name: "David Chen", role: "Pet Owner", text: "“I was kinda nervous about taking Luna for grooming, but they totally relaxed her and made the experience enjoyable.”", avatar: `/demowebsite/person1.webp`, bg: bgOffWhite, textColor: mutedText, titleColor: darkText, starColor: pColor },
            { type: "stat-numeric", score: aiData.rating, scale: "/5", subtext: `Trusted by ${aiData.reviews} owners`, bg: pColor, scoreColor: lightText, textColor: lightText, starColor: lightText }
          ],
          col2: [
            { type: "review", name: "James Thornton", role: "Pet Owner", text: "“They truly transformed my golden retriever, Max! He looked amazing and was happy the whole time. Exceptional care.”", avatar: `/demowebsite/person2.webp`, bg: bgOffWhite, textColor: mutedText, titleColor: darkText, starColor: pColor }
          ],
          col3: [
            { type: "stat-image", image: `/demowebsite/reviewcard.avif`, heading: "100%", subtext: "Satisfaction Guaranteed", bg: pColor, textColor: lightText, iconColor: lightText },
            { type: "review", name: "Marcus Williams", role: "Pet Owner", text: "“As someone who owns three pets, I need a groomer I can fully trust. These guys are the absolute best.”", avatar: `/demowebsite/person3.webp`, bg: bgOffWhite, textColor: mutedText, titleColor: darkText, starColor: pColor }
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
        button: { label: "Send Message", bg: pColor, text: lightText, className: "" }
      },
      ctaSection: {
        section: { bg: bgOffWhite, className: "" },
        heading: { text: aiData.finalCtaHeading, color: darkText, className: "" },
        description: { text: aiData.finalCtaDesc, color: mutedText, className: "" },
        image: { src: `/demowebsite/cta.avif`, className: "" },
        cta: { label: "Book Appointment", href: "#contact", bg: pColor, text: lightText, className: "" }
      },
      footer: {
        section: { bg: "#fdfdfd", className: "" },
        logo: { src: logoUrl, alt: `${aiData.businessName} Logo`, className: "" },
        styling: { textColor: darkText, mutedColor: mutedText, iconBg: pColor, iconText: lightText },
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

    // 🔥 3. SAVE TO "websites" COLLECTION USING THE SLUG AS THE ID
    const websiteRef = doc(db, "websites", uniqueSlug);
    await setDoc(websiteRef, websiteData);

    // 🔥 4. UPDATE THE ORIGINAL LEAD WITH THE NEW SLUG
    await updateDoc(leadRef, {
      websiteSlug: uniqueSlug,
      websiteGeneratedAt: new Date().toISOString(),
      logoStatus: "website_generated" // Optional: update status so it doesn't get processed twice
    });

    // 🔥 5. RETURN THE SLUG DIRECTLY TO n8n
    return NextResponse.json({ 
      success: true, 
      slug: uniqueSlug, 
      message: "Website saved to websites collection successfully." 
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}