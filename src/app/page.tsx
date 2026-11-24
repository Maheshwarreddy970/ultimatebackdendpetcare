import Image from "next/image";

export default function Home() {
  return (
    <>
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert h-5 w-[100px]"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            To get started, edit the{" "}
            <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
              page.tsx
            </code>{" "}
            file.
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert h-[14px] w-4"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={14}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
   <section className="relative w-full overflow-hidden bg-white px-5 py-16 md:px-10 md:py-24 lg:py-38 lg:pl-25 lg:pr-25">
      <div className="mx-auto flex w-full max-w-360 flex-col items-start gap-10 lg:gap-14">
        {/* Header */}
        <div className="flex w-full flex-col items-start gap-8 lg:flex-row lg:gap-28">
          {/* Badge */}
          <div className="flex h-6.5 w-fit items-center justify-center gap-2 rounded-full bg-surface p-2">
            <div className="flex w-4 flex-col items-center overflow-hidden">
              <div className="relative h-4 w-4 overflow-hidden">
                <div className="absolute left-0 top-0 h-4 w-4">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="absolute left-0 top-0 h-4 w-4"
                  >
                    <path
                      d="M8 4V0L16 4V12L8 16V12L0 16V12L8 8L0 4V0L8 4ZM8 4V12L16 8L8 4Z"
                      fill="#3564ED"
                    />
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex w-fit flex-col items-start">
              <div className="flex w-full items-start gap-0.75">
                <p className="w-fit font-inter text-sm font-medium leading-none text-subtle">YOUR</p>
                <p className="w-fit font-inter text-sm font-medium leading-none text-subtle">SPACE.</p>
                <p className="w-fit font-inter text-sm font-medium leading-none text-subtle">YOUR</p>
                <p className="w-fit font-inter text-sm font-medium leading-none text-subtle">POOL.</p>
              </div>
            </div>
          </div>

          {/* Heading + description */}
          <div className="flex w-full flex-col items-start gap-7 lg:pr-80">
            <div className="flex w-full flex-col items-start">
              <h1 className="w-full font-parkinsans text-4xl font-semibold leading-10 text-heading md:text-5xl md:leading-12">
                Turn Your Backyard Into Your Favorite Place
              </h1>
            </div>
            <div className="flex w-full flex-col items-start">
              <p className="w-full font-inter text-base leading-6 text-muted">
                Whether you’re looking for a place to relax, entertain, exercise, or bring the
                family together, we’ll help you create a pool that fits the way you live.
              </p>
            </div>
          </div>
        </div>

        {/* Stats + images */}
        <div className="flex w-full flex-col items-center gap-10 lg:flex-row lg:justify-center lg:gap-32">
          {/* Left column */}
          <div className="flex w-full flex-col items-start justify-between gap-8 lg:h-107.5 lg:w-47">
            <div className="flex w-48 flex-col items-start gap-4">
              <div className="flex w-fit flex-col items-start">
                <div className="flex w-full items-start">
                  <div className="flex h-full w-fit items-baseline gap-0.75">
                    <p className="w-fit font-inter text-5xl font-semibold leading-12 text-heading">10</p>
                    <p className="w-fit font-inter text-5xl font-semibold leading-12 text-heading">+</p>
                  </div>
                </div>
              </div>
              <div className="flex w-full flex-col items-start">
                <p className="w-full font-inter text-base leading-6 text-muted">Years of Experience</p>
              </div>
            </div>
            <div className="flex h-47 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg">
              <img
                src="/LuxurySwimmingPoolProjectCompletedByPoolen.png"
                alt="Luxury swimming pool project completed by POOLEN"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          {/* Center image */}
          <div className="relative h-80 w-full overflow-hidden rounded-2xl md:h-96 lg:h-107.5 lg:flex-1">
            <img
              src="/CustomSwimmingPoolAndOutdoorLivingSpaceDesignedByPoolen.png"
              alt="Custom swimming pool and outdoor living space designed by POOLEN"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>

          {/* Right column */}
          <div className="flex w-full flex-col items-start justify-between gap-8 lg:h-107.5 lg:w-47">
            <div className="flex h-47 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg">
              <img
                src="/CompletedResidentialSwimmingPoolByPoolen.png"
                alt="Completed residential swimming pool by POOLEN"
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex w-36 flex-col items-start gap-4">
              <div className="flex w-fit flex-col items-start">
                <div className="flex w-full items-start">
                  <div className="flex h-full w-fit items-baseline gap-0.75">
                    <p className="w-fit font-inter text-5xl font-semibold leading-12 text-heading">250</p>
                    <p className="w-fit font-inter text-5xl font-semibold leading-12 text-heading">+</p>
                  </div>
                </div>
              </div>
              <div className="flex w-full flex-col items-start">
                <p className="w-full font-inter text-base leading-6 text-muted">Pools installed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Body copy */}
        <div className="flex w-full items-center lg:pl-80">
          <div className="flex w-full max-w-3xl flex-col items-start">
            <div className="flex w-full flex-col items-start">
              <p className="w-full font-inter text-xl leading-8 text-muted md:text-2xl md:leading-9">
                A well-designed pool should feel like it belongs in your home. Poolen handles every
                stage of the installation process, creating outdoor spaces that look exceptional,
                function beautifully, and are made to last.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
 
    </>
  );
}
