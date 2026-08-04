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

const MICROSCOPY_SLIDES: GallerySlide[] = [
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

function microscopyForRoute(route: SiteRoute): GallerySlide {
  if (route.section === "members") return MICROSCOPY_SLIDES[1];
  if (route.section === "publications") return MICROSCOPY_SLIDES[2];
  if (route.section === "join" || route.section === "contact") return MICROSCOPY_SLIDES[3];
  return MICROSCOPY_SLIDES[0];
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

  useEffect(() => {
    const root = rootRef.current;
    const main = root?.querySelector("main");
    if (!root || !main) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const directSections = Array.from(main.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element.tagName === "SECTION",
    );

    const isHome = props.route.section === "home";
    const revealSections = directSections.slice(isHome ? 1 : 0);
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
      const microscopy = microscopyForRoute(props.route);

      image.removeAttribute("srcset");
      image.src = microscopy.src;
      image.alt = microscopy.alt;
      image.decoding = "async";
      innerHero.classList.add("kinetic-inner-hero");
      innerHero.setAttribute("data-microscopy-credit", microscopy.credit);

      return () => {
        cleanSharedEffects();
        image.src = originalSource;
        image.alt = originalAlt;
        if (originalSrcset) image.setAttribute("srcset", originalSrcset);
        innerHero.classList.remove("kinetic-inner-hero");
        innerHero.removeAttribute("data-microscopy-credit");
      };
    }

    if (!homeHero) return cleanSharedEffects;

    const originalImage = homeHero.querySelector(":scope > img");
    if (!(originalImage instanceof HTMLImageElement)) return cleanSharedEffects;

    const originalSource = originalImage.getAttribute("src") || "";
    const originalSrcset = originalImage.getAttribute("srcset");
    const originalAlt = originalImage.alt;

    homeHero.classList.add("kinetic-photo-hero");
    homeHero.setAttribute("aria-roledescription", "carousel");
    homeHero.setAttribute("aria-label", `${props.site.labName} microscopy gallery`);

    const slides = MICROSCOPY_SLIDES;
    const slideNodes: HTMLImageElement[] = [originalImage];
    const addedNodes: HTMLElement[] = [];

    originalImage.removeAttribute("srcset");
    originalImage.src = slides[0].src;
    originalImage.alt = slides[0].alt;
    originalImage.classList.add("kinetic-gallery-slide", "is-active");
    originalImage.dataset.galleryIndex = "0";
    originalImage.setAttribute("aria-hidden", "false");

    slides.slice(1).forEach((slide, offset) => {
      const image = document.createElement("img");
      image.src = slide.src;
      image.alt = slide.alt;
      image.decoding = "async";
      image.loading = offset === 0 ? "eager" : "lazy";
      image.className = "kinetic-gallery-slide";
      image.dataset.galleryIndex = String(offset + 1);
      image.setAttribute("aria-hidden", "true");
      homeHero.appendChild(image);
      slideNodes.push(image);
      addedNodes.push(image);
    });

    const credit = document.createElement("div");
    credit.className = "kinetic-gallery-credit";
    credit.setAttribute("aria-live", "polite");
    credit.textContent = slides[0].credit;
    homeHero.appendChild(credit);
    addedNodes.push(credit);

    const scrollCue = document.createElement("div");
    scrollCue.className = "kinetic-scroll-cue";
    scrollCue.textContent = "Scroll to explore";
    homeHero.appendChild(scrollCue);
    addedNodes.push(scrollCue);

    const controls = document.createElement("div");
    controls.className = "kinetic-gallery-controls";
    const previous = makeButton("kinetic-gallery-arrow", "Previous microscopy image", "←");
    const next = makeButton("kinetic-gallery-arrow", "Next microscopy image", "→");
    const dots = document.createElement("div");
    dots.className = "kinetic-gallery-dots";
    dots.setAttribute("role", "tablist");
    dots.setAttribute("aria-label", "Choose microscopy image");

    const dotNodes = slides.map((slide, index) => {
      const dot = makeButton("kinetic-gallery-dot", `Show image ${index + 1}: ${slide.alt}`, "");
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-selected", index === 0 ? "true" : "false");
      if (index === 0) dot.classList.add("is-active");
      dots.appendChild(dot);
      return dot;
    });

    controls.append(previous, dots, next);
    homeHero.appendChild(controls);
    addedNodes.push(controls);

    let activeIndex = 0;
    let timer = 0;
    let paused = false;
    let pointerStartX: number | undefined;

    const showSlide = (nextIndex: number) => {
      activeIndex = (nextIndex + slides.length) % slides.length;
      homeHero.dataset.galleryIndex = String(activeIndex);
      slideNodes.forEach((image, index) => {
        const active = index === activeIndex;
        image.classList.toggle("is-active", active);
        image.setAttribute("aria-hidden", active ? "false" : "true");
      });
      dotNodes.forEach((dot, index) => {
        const active = index === activeIndex;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-selected", active ? "true" : "false");
      });
      credit.textContent = slides[activeIndex].credit;
    };

    const stopTimer = () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
    };

    const startTimer = () => {
      stopTimer();
      if (!reducedMotion && !paused && !document.hidden) {
        timer = window.setInterval(() => showSlide(activeIndex + 1), 6500);
      }
    };

    const pause = () => {
      paused = true;
      stopTimer();
    };

    const resume = () => {
      paused = false;
      startTimer();
    };

    const goPrevious = () => {
      showSlide(activeIndex - 1);
      startTimer();
    };

    const goNext = () => {
      showSlide(activeIndex + 1);
      startTimer();
    };

    const onVisibilityChange = () => startTimer();
    const onPointerDown = (event: PointerEvent) => {
      pointerStartX = event.clientX;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (pointerStartX === undefined) return;
      const distance = event.clientX - pointerStartX;
      pointerStartX = undefined;
      if (Math.abs(distance) > 55) distance > 0 ? goPrevious() : goNext();
    };

    previous.addEventListener("click", goPrevious);
    next.addEventListener("click", goNext);
    dotNodes.forEach((dot, index) => dot.addEventListener("click", () => {
      showSlide(index);
      startTimer();
    }));
    homeHero.addEventListener("mouseenter", pause);
    homeHero.addEventListener("mouseleave", resume);
    homeHero.addEventListener("focusin", pause);
    homeHero.addEventListener("focusout", resume);
    homeHero.addEventListener("pointerdown", onPointerDown);
    homeHero.addEventListener("pointerup", onPointerUp);
    document.addEventListener("visibilitychange", onVisibilityChange);
    startTimer();

    return () => {
      stopTimer();
      cleanSharedEffects();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      previous.removeEventListener("click", goPrevious);
      next.removeEventListener("click", goNext);
      homeHero.removeEventListener("mouseenter", pause);
      homeHero.removeEventListener("mouseleave", resume);
      homeHero.removeEventListener("focusin", pause);
      homeHero.removeEventListener("focusout", resume);
      homeHero.removeEventListener("pointerdown", onPointerDown);
      homeHero.removeEventListener("pointerup", onPointerUp);
      addedNodes.forEach((node) => node.remove());
      originalImage.classList.remove("kinetic-gallery-slide", "is-active");
      originalImage.removeAttribute("data-gallery-index");
      originalImage.removeAttribute("aria-hidden");
      originalImage.src = originalSource;
      originalImage.alt = originalAlt;
      if (originalSrcset) originalImage.setAttribute("srcset", originalSrcset);
      homeHero.classList.remove("kinetic-photo-hero");
      homeHero.removeAttribute("aria-roledescription");
      homeHero.removeAttribute("aria-label");
      homeHero.removeAttribute("data-gallery-index");
      homeHero.style.removeProperty("--kinetic-progress");
    };
  }, [props.route.projectSlug, props.route.section, props.site.labName, props.site.slug]);

  return (
    <div className={`${styles.root} ${props.route.section === "home" ? styles.home : ""}`} ref={rootRef}>
      <PhotoLabDesign {...props} />
    </div>
  );
}
