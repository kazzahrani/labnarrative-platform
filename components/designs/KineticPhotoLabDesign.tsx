"use client";

import { useEffect, useRef } from "react";
import PhotoLabDesign from "@/components/designs/PhotoLabDesign";
import type { LabSite, SiteRoute } from "@/lib/sites";
import styles from "./KineticPhotoLabDesign.module.css";

type KineticPhotoLabDesignProps = {
  site: LabSite;
  route: SiteRoute;
  basePath: string;
  previewMode?: boolean;
};

type GallerySlide = {
  src: string;
  alt: string;
  credit: string;
};

const PRIVES_SLIDES: GallerySlide[] = [
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/b/b3/HeLa-I.jpg",
    alt: "Multiphoton fluorescence microscopy of HeLa cells showing Golgi apparatus, microtubules and DNA",
    credit: "HeLa cells · Golgi, microtubules & DNA · NIH · Public domain",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/2/21/HeLa-II.jpg",
    alt: "Multiphoton fluorescence microscopy of HeLa cells showing actin, microtubules and nuclei",
    credit: "HeLa cells · Actin, microtubules & nuclei · NIH · Public domain",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/4/4d/Multicolor_fluorescence_image_of_a_living_HeLa_cell.jpg",
    alt: "Confocal fluorescence image of living HeLa cells showing mitochondria, microtubules and nuclei",
    credit: "Living HeLa cells · Mitochondria, microtubules & nuclei · 8x57is · CC BY-SA 4.0",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/0/09/Fluorescence_microscopy_of_the_oral_cancer_cells.jpg",
    alt: "Fluorescence microscopy of human oral cancer cells",
    credit: "Human oral cancer cells · Korinna · CC BY 4.0",
  },
];

const CIRIBILLI_HOME_SLIDES: GallerySlide[] = [PRIVES_SLIDES[1]];

const ENGELAND_SLIDES: GallerySlide[] = [
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/0/0d/0300_Flourescence_Stained.jpg",
    alt: "Fluorescence microscopy of a cell in anaphase showing chromosomes, spindle microtubules and cell cortex",
    credit: "Anaphase · chromosomes, spindle & cortex · OpenStax · CC BY 4.0",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/6/69/HeLa_multipolar_mitosis.jpg",
    alt: "Microscopy of a HeLa cell undergoing multipolar mitosis",
    credit: "HeLa multipolar mitosis · Catfaster · CC BY-SA 4.0",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/b/b3/HeLa-I.jpg",
    alt: "Fluorescence microscopy of HeLa cells showing microtubules and DNA",
    credit: "HeLa cells · microtubules & DNA · NIH · Public domain",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/4/4d/Multicolor_fluorescence_image_of_a_living_HeLa_cell.jpg",
    alt: "Confocal microscopy of living HeLa cells showing the microtubule network, mitochondria and nuclei",
    credit: "Living HeLa cells · microtubules, mitochondria & nuclei · 8x57is · CC BY-SA 4.0",
  },
];

function slidesForSite(slug: string): GallerySlide[] {
  return slug === "engeland" ? ENGELAND_SLIDES : PRIVES_SLIDES;
}

function microscopyForRoute(route: SiteRoute, slides: GallerySlide[]): GallerySlide {
  if (route.section === "members") return slides[1] ?? slides[0];
  if (route.section === "publications") return slides[2] ?? slides[0];
  if (route.section === "join" || route.section === "contact") return slides[3] ?? slides[0];
  return slides[0];
}

function makeButton(className: string, label: string, text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  button.textContent = text;
  return button;
}

export default function KineticPhotoLabDesign(props: KineticPhotoLabDesignProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isEngeland = props.site.slug === "engeland";
  const isPrives = props.site.slug === "prives";

  useEffect(() => {
    const root = rootRef.current;
    const main = root?.querySelector("main");
    if (!root || !main) return;

    const slides = slidesForSite(props.site.slug);
    const homeSlides = props.site.slug === "ciribilli"
      ? CIRIBILLI_HOME_SLIDES
      : slides;
    const hasMultipleHomeSlides = homeSlides.length > 1;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sectionRoot = props.route.projectSlug
      ? main.querySelector(":scope > article") ?? main
      : main;
    const directSections = Array.from(sectionRoot.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element.tagName === "SECTION",
    );

    const isHome = props.route.section === "home";
    const hiddenHomeSections = isHome && isPrives ? directSections.slice(3, 5) : [];
    hiddenHomeSections.forEach((section) => {
      section.hidden = true;
    });

    const revealSections = directSections
      .slice(isHome ? 1 : 0)
      .filter((section) => !hiddenHomeSections.includes(section));
    revealSections.forEach((section) => section.classList.add("kinetic-reveal"));

    let observer: IntersectionObserver | undefined;
    if (reducedMotion) {
      revealSections.forEach((section) => section.classList.add("is-visible"));
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer?.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -8%", threshold: 0.12 },
      );
      revealSections.forEach((section) => observer?.observe(section));
    }

    const homeHero = isHome ? directSections[0] : undefined;
    const innerHero = !isHome ? directSections[0] : undefined;
    let animationFrame = 0;

    const updateScrollEffects = () => {
      animationFrame = 0;
      const pageRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      root.style.setProperty("--kinetic-page-progress", String(Math.min(1, Math.max(0, window.scrollY / pageRange))));
      if (homeHero && !reducedMotion) {
        const rect = homeHero.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
        homeHero.style.setProperty("--kinetic-progress", String(progress));
      }
    };

    const requestScrollUpdate = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateScrollEffects);
    };

    const cleanSharedEffects = () => {
      observer?.disconnect();
      revealSections.forEach((section) => section.classList.remove("kinetic-reveal", "is-visible"));
      hiddenHomeSections.forEach((section) => {
        section.hidden = false;
      });
      window.removeEventListener("scroll", requestScrollUpdate);
      window.removeEventListener("resize", requestScrollUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      root.style.removeProperty("--kinetic-page-progress");
    };

    updateScrollEffects();
    window.addEventListener("scroll", requestScrollUpdate, { passive: true });
    window.addEventListener("resize", requestScrollUpdate);

    if (innerHero) {
      const image = innerHero.querySelector(":scope > img");
      if (!(image instanceof HTMLImageElement)) return cleanSharedEffects;
      const originalSource = image.getAttribute("src") || "";
      const originalSrcset = image.getAttribute("srcset");
      const originalAlt = image.alt;
      const originalImageDisplay = image.style.display;
      const originalBackground = innerHero.style.background;
      const shade = innerHero.querySelector(":scope > div:nth-of-type(1)");
      const heading = innerHero.querySelector(":scope > div:nth-of-type(2) > h1");
      const originalShadeBackground = shade instanceof HTMLElement ? shade.style.background : "";
      const originalHeadingShadow = heading instanceof HTMLElement ? heading.style.textShadow : "";
      const isSolidPrivesProject = isPrives && props.route.section === "research" && Boolean(props.route.projectSlug);

      innerHero.classList.add("kinetic-inner-hero");

      if (isSolidPrivesProject) {
        image.style.display = "none";
        innerHero.style.background = "linear-gradient(120deg, #451d2b 0%, #351620 58%, #241016 100%)";
        if (shade instanceof HTMLElement) {
          shade.style.background = "linear-gradient(90deg, rgba(255, 255, 255, 0.025), rgba(0, 0, 0, 0.08))";
        }
        if (heading instanceof HTMLElement) {
          heading.style.textShadow = "none";
        }
        innerHero.removeAttribute("data-microscopy-credit");
      } else {
        const microscopy = microscopyForRoute(props.route, slides);
        image.removeAttribute("srcset");
        image.src = microscopy.src;
        image.alt = microscopy.alt;
        image.decoding = "async";
        innerHero.setAttribute("data-microscopy-credit", microscopy.credit);
      }

      return () => {
        cleanSharedEffects();
        image.style.display = originalImageDisplay;
        image.src = originalSource;
        image.alt = originalAlt;
        if (originalSrcset) image.setAttribute("srcset", originalSrcset);
        innerHero.style.background = originalBackground;
        if (shade instanceof HTMLElement) shade.style.background = originalShadeBackground;
        if (heading instanceof HTMLElement) heading.style.textShadow = originalHeadingShadow;
        innerHero.classList.remove("kinetic-inner-hero");
        innerHero.removeAttribute("data-microscopy-credit");
      };
    }

    if (!homeHero) return cleanSharedEffects;
    const originalImage = homeHero.querySelector(":scope > img");
    const placeholder = homeHero.querySelector(":scope > div:first-child");
    const image = originalImage instanceof HTMLImageElement ? originalImage : document.createElement("img");
    const insertedImage = !(originalImage instanceof HTMLImageElement);
    if (insertedImage) {
      image.className = "kinetic-gallery-slide is-active";
      homeHero.insertBefore(image, placeholder ?? homeHero.firstChild);
      if (placeholder instanceof HTMLElement) placeholder.style.display = "none";
    }

    const originalSource = image.getAttribute("src") || "";
    const originalSrcset = image.getAttribute("srcset");
    const originalAlt = image.alt;

    homeHero.classList.add("kinetic-photo-hero");
    if (hasMultipleHomeSlides) {
      homeHero.setAttribute("aria-roledescription", "carousel");
      homeHero.setAttribute("aria-label", `${props.site.labName} microscopy gallery`);
    } else {
      homeHero.removeAttribute("aria-roledescription");
      homeHero.setAttribute("aria-label", `${props.site.labName} microscopy image`);
    }

    const slideNodes: HTMLImageElement[] = [image];
    const addedNodes: HTMLElement[] = [];
    image.removeAttribute("srcset");
    image.src = homeSlides[0].src;
    image.alt = homeSlides[0].alt;
    image.classList.add("kinetic-gallery-slide", "is-active");
    image.dataset.galleryIndex = "0";
    image.setAttribute("aria-hidden", "false");

    homeSlides.slice(1).forEach((slide, offset) => {
      const nextImage = document.createElement("img");
      nextImage.src = slide.src;
      nextImage.alt = slide.alt;
      nextImage.decoding = "async";
      nextImage.loading = offset === 0 ? "eager" : "lazy";
      nextImage.className = "kinetic-gallery-slide";
      nextImage.dataset.galleryIndex = String(offset + 1);
      nextImage.setAttribute("aria-hidden", "true");
      homeHero.appendChild(nextImage);
      slideNodes.push(nextImage);
      addedNodes.push(nextImage);
    });

    const credit = document.createElement("div");
    credit.className = "kinetic-gallery-credit";
    credit.setAttribute("aria-live", "polite");
    credit.textContent = homeSlides[0].credit;
    homeHero.appendChild(credit);
    addedNodes.push(credit);

    if (!isPrives && hasMultipleHomeSlides) {
      const scrollCue = document.createElement("div");
      scrollCue.className = "kinetic-scroll-cue";
      scrollCue.textContent = "Scroll to explore";
      homeHero.appendChild(scrollCue);
      addedNodes.push(scrollCue);
    }

    let previous: HTMLButtonElement | undefined;
    let next: HTMLButtonElement | undefined;
    const dotNodes: HTMLButtonElement[] = [];

    if (hasMultipleHomeSlides) {
      const controls = document.createElement("div");
      controls.className = "kinetic-gallery-controls";
      previous = isPrives ? undefined : makeButton("kinetic-gallery-arrow", "Previous microscopy image", "←");
      next = isPrives ? undefined : makeButton("kinetic-gallery-arrow", "Next microscopy image", "→");
      const dots = document.createElement("div");
      dots.className = "kinetic-gallery-dots";
      dots.setAttribute("role", "tablist");
      dots.setAttribute("aria-label", "Choose microscopy image");

      homeSlides.forEach((slide, index) => {
        const dot = makeButton("kinetic-gallery-dot", `Show image ${index + 1}: ${slide.alt}`, "");
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-selected", index === 0 ? "true" : "false");
        if (index === 0) dot.classList.add("is-active");
        dots.appendChild(dot);
        dotNodes.push(dot);
      });

      if (previous && next) controls.append(previous, dots, next);
      else controls.append(dots);
      homeHero.appendChild(controls);
      addedNodes.push(controls);
    }

    let activeIndex = 0;
    let timer = 0;
    let paused = false;
    let pointerStartX: number | undefined;

    const showSlide = (nextIndex: number) => {
      activeIndex = (nextIndex + homeSlides.length) % homeSlides.length;
      slideNodes.forEach((slideImage, index) => {
        const active = index === activeIndex;
        slideImage.classList.toggle("is-active", active);
        slideImage.setAttribute("aria-hidden", active ? "false" : "true");
      });
      dotNodes.forEach((dot, index) => {
        const active = index === activeIndex;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-selected", active ? "true" : "false");
      });
      credit.textContent = homeSlides[activeIndex].credit;
    };

    const stopTimer = () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
    };
    const startTimer = () => {
      stopTimer();
      const interval = isPrives ? 10000 : 6500;
      const motionAllowsAutoplay = isPrives || !reducedMotion;
      if (hasMultipleHomeSlides && motionAllowsAutoplay && !paused && !document.hidden) {
        timer = window.setInterval(() => showSlide(activeIndex + 1), interval);
      }
    };
    const pause = () => { paused = true; stopTimer(); };
    const resume = () => { paused = false; startTimer(); };
    const goPrevious = () => { showSlide(activeIndex - 1); startTimer(); };
    const goNext = () => { showSlide(activeIndex + 1); startTimer(); };
    const onVisibilityChange = () => startTimer();
    const onPointerDown = (event: PointerEvent) => { pointerStartX = event.clientX; };
    const onPointerUp = (event: PointerEvent) => {
      if (pointerStartX === undefined) return;
      const distance = event.clientX - pointerStartX;
      pointerStartX = undefined;
      if (Math.abs(distance) > 55) distance > 0 ? goPrevious() : goNext();
    };

    previous?.addEventListener("click", goPrevious);
    next?.addEventListener("click", goNext);
    dotNodes.forEach((dot, index) => dot.addEventListener("click", () => { showSlide(index); startTimer(); }));
    if (hasMultipleHomeSlides && !isPrives) {
      homeHero.addEventListener("mouseenter", pause);
      homeHero.addEventListener("mouseleave", resume);
      homeHero.addEventListener("focusin", pause);
      homeHero.addEventListener("focusout", resume);
    }
    if (hasMultipleHomeSlides) {
      homeHero.addEventListener("pointerdown", onPointerDown);
      homeHero.addEventListener("pointerup", onPointerUp);
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    startTimer();

    return () => {
      stopTimer();
      cleanSharedEffects();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      previous?.removeEventListener("click", goPrevious);
      next?.removeEventListener("click", goNext);
      if (hasMultipleHomeSlides && !isPrives) {
        homeHero.removeEventListener("mouseenter", pause);
        homeHero.removeEventListener("mouseleave", resume);
        homeHero.removeEventListener("focusin", pause);
        homeHero.removeEventListener("focusout", resume);
      }
      homeHero.removeEventListener("pointerdown", onPointerDown);
      homeHero.removeEventListener("pointerup", onPointerUp);
      addedNodes.forEach((node) => node.remove());
      if (insertedImage) image.remove();
      else {
        image.classList.remove("kinetic-gallery-slide", "is-active");
        image.removeAttribute("data-gallery-index");
        image.removeAttribute("aria-hidden");
        image.src = originalSource;
        image.alt = originalAlt;
        if (originalSrcset) image.setAttribute("srcset", originalSrcset);
      }
      if (placeholder instanceof HTMLElement) placeholder.style.removeProperty("display");
      homeHero.classList.remove("kinetic-photo-hero");
      homeHero.removeAttribute("aria-roledescription");
      homeHero.removeAttribute("aria-label");
      homeHero.style.removeProperty("--kinetic-progress");
    };
  }, [isPrives, props.route.projectSlug, props.route.section, props.site.labName, props.site.slug]);

  return (
    <div
      className={`${styles.root} ${props.route.section === "home" ? styles.home : ""} ${isPrives ? "prives-kinetic" : ""} ${isEngeland ? `${styles.light} engeland-kinetic` : ""}`}
      ref={rootRef}
    >
      <PhotoLabDesign {...props} />
      {isPrives && (
        <style jsx global>{`
          .prives-kinetic .kinetic-scroll-cue,
          .prives-kinetic .kinetic-gallery-arrow {
            display: none !important;
          }

          .prives-kinetic .kinetic-gallery-controls {
            bottom: 20px !important;
            left: auto !important;
            right: 22px !important;
            transform: none !important;
          }

          .prives-kinetic .kinetic-gallery-dots {
            background: rgba(0, 0, 0, 0.12) !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            gap: 5px !important;
            opacity: 0.48;
            padding: 5px 7px !important;
            transition: opacity 220ms ease;
          }

          .prives-kinetic .kinetic-gallery-controls:hover .kinetic-gallery-dots,
          .prives-kinetic .kinetic-gallery-controls:focus-within .kinetic-gallery-dots {
            opacity: 0.72;
          }

          .prives-kinetic .kinetic-gallery-dot {
            background: rgba(255, 255, 255, 0.46) !important;
            height: 4px !important;
            width: 4px !important;
          }

          .prives-kinetic .kinetic-gallery-dot.is-active {
            background: rgba(255, 255, 255, 0.82) !important;
            width: 12px !important;
          }

          @media (max-width: 820px) {
            .prives-kinetic .kinetic-gallery-controls {
              bottom: 14px !important;
              right: 14px !important;
            }
          }
        `}</style>
      )}
      {isEngeland && (
        <style jsx global>{`
          @media (min-width: 821px) {
            .engeland-kinetic main > header {
              min-height: 92px !important;
              padding-top: 0 !important;
              padding-bottom: 0 !important;
            }
            .engeland-kinetic .kinetic-photo-hero {
              height: calc(100svh - 92px) !important;
              min-height: 500px !important;
              max-height: 690px !important;
            }
            .engeland-kinetic .kinetic-photo-hero > div:nth-of-type(2) {
              bottom: clamp(42px, 5vh, 62px) !important;
            }
            .engeland-kinetic .kinetic-photo-hero > div:nth-of-type(2) > h1 {
              font-size: clamp(44px, 5.6vw, 78px) !important;
              max-width: 700px !important;
            }
            .engeland-kinetic main > section:nth-of-type(2) {
              height: min(680px, calc(100svh - 92px)) !important;
              min-height: 520px !important;
              padding-top: 34px !important;
              padding-bottom: 34px !important;
            }
            .engeland-kinetic main > section:nth-of-type(2) > h2 {
              font-size: clamp(34px, 3.8vw, 54px) !important;
              max-width: 880px !important;
            }
            .engeland-kinetic main > section:nth-of-type(2) > div:first-of-type {
              font-size: clamp(17px, 1.45vw, 21px) !important;
              line-height: 1.5 !important;
              max-width: 780px !important;
            }
            .engeland-kinetic main > section:nth-of-type(3) {
              height: min(720px, calc(100svh - 92px)) !important;
              min-height: 560px !important;
              max-height: 720px !important;
            }
            .engeland-kinetic main > section:nth-of-type(3) > div:last-child {
              padding: clamp(30px, 3.8vw, 56px) !important;
            }
            .engeland-kinetic main > section:nth-of-type(3) > div:last-child > h2 {
              font-size: clamp(40px, 4.3vw, 62px) !important;
            }
            .engeland-kinetic main > section:nth-of-type(3) > div:last-child > div {
              font-size: clamp(15px, 1.18vw, 18px) !important;
              line-height: 1.48 !important;
            }
          }
        `}</style>
      )}
    </div>
  );
}
