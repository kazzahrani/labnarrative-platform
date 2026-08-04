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

const SCIENCE_SLIDES: GallerySlide[] = [
  {
    src: "https://visualsonline.cancer.gov/retrieve.cfm?dpi=300&fileformat=jpg&imageid=10573",
    alt: "Multiphoton microscopy image of a breast tumour microenvironment",
    credit: "Breast tumour microenvironment · Szulczewski, Inman, Eliceiri & Keely · NCI",
  },
  {
    src: "https://visualsonline.cancer.gov/retrieve.cfm?dpi=300&fileformat=jpg&imageid=11866",
    alt: "Fluorescence microscopy image of HeLa cells showing Golgi, microtubules and DNA",
    credit: "HeLa cells · Golgi, microtubules & DNA · Tom Deerinck / NIGMS, NIH",
  },
  {
    src: "https://visualsonline.cancer.gov/retrieve.cfm?dpi=300&fileformat=jpg&imageid=11867",
    alt: "Fluorescence microscopy image of HeLa cells showing actin, microtubules and nuclei",
    credit: "HeLa cells · Actin, microtubules & nuclei · Tom Deerinck / NIGMS, NIH",
  },
  {
    src: "https://visualsonline.cancer.gov/retrieve.cfm?dpi=300&fileformat=jpg&imageid=10502",
    alt: "Fluorescence microscopy image showing heterogeneity in triple-negative breast cancer",
    credit: "Triple-negative breast cancer heterogeneity · Kevin Janes / NCI",
  },
];

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

    const revealSections = directSections.slice(props.route.section === "home" ? 1 : 0);
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

    const homeHero = props.route.section === "home" ? directSections[0] : undefined;
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

    updateScrollEffects();
    window.addEventListener("scroll", requestScrollUpdate, { passive: true });
    window.addEventListener("resize", requestScrollUpdate);

    if (!homeHero) {
      return () => {
        observer?.disconnect();
        revealSections.forEach((section) => section.classList.remove("kinetic-reveal", "is-visible"));
        window.removeEventListener("scroll", requestScrollUpdate);
        window.removeEventListener("resize", requestScrollUpdate);
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        root.style.removeProperty("--kinetic-page-progress");
      };
    }

    const originalImage = homeHero.querySelector(":scope > img");
    if (!(originalImage instanceof HTMLImageElement)) {
      return () => {
        observer?.disconnect();
        revealSections.forEach((section) => section.classList.remove("kinetic-reveal", "is-visible"));
        window.removeEventListener("scroll", requestScrollUpdate);
        window.removeEventListener("resize", requestScrollUpdate);
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        root.style.removeProperty("--kinetic-page-progress");
      };
    }

    homeHero.classList.add("kinetic-photo-hero");
    homeHero.setAttribute("aria-roledescription", "carousel");
    homeHero.setAttribute("aria-label", `${props.site.labName} visual gallery`);

    const originalSlide: GallerySlide = {
      src: originalImage.currentSrc || originalImage.src,
      alt: originalImage.alt || `${props.site.labName} portrait`,
      credit: `${props.site.piName} · ${props.site.institution}`,
    };
    const slides = [originalSlide, ...SCIENCE_SLIDES];
    const slideNodes: HTMLImageElement[] = [originalImage];
    const addedNodes: HTMLElement[] = [];

    originalImage.classList.add("kinetic-gallery-slide", "is-active");
    originalImage.dataset.galleryIndex = "0";
    originalImage.setAttribute("aria-hidden", "false");

    SCIENCE_SLIDES.forEach((slide, offset) => {
      const image = document.createElement("img");
      image.src = slide.src;
      image.alt = slide.alt;
      image.decoding = "async";
      image.loading = offset < 1 ? "eager" : "lazy";
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
    const previous = makeButton("kinetic-gallery-arrow", "Previous gallery image", "←");
    const next = makeButton("kinetic-gallery-arrow", "Next gallery image", "→");
    const dots = document.createElement("div");
    dots.className = "kinetic-gallery-dots";
    dots.setAttribute("role", "tablist");
    dots.setAttribute("aria-label", "Choose gallery image");

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
      observer?.disconnect();
      revealSections.forEach((section) => section.classList.remove("kinetic-reveal", "is-visible"));
      window.removeEventListener("scroll", requestScrollUpdate);
      window.removeEventListener("resize", requestScrollUpdate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      previous.removeEventListener("click", goPrevious);
      next.removeEventListener("click", goNext);
      homeHero.removeEventListener("mouseenter", pause);
      homeHero.removeEventListener("mouseleave", resume);
      homeHero.removeEventListener("focusin", pause);
      homeHero.removeEventListener("focusout", resume);
      homeHero.removeEventListener("pointerdown", onPointerDown);
      homeHero.removeEventListener("pointerup", onPointerUp);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      addedNodes.forEach((node) => node.remove());
      originalImage.classList.remove("kinetic-gallery-slide", "is-active");
      originalImage.removeAttribute("data-gallery-index");
      originalImage.removeAttribute("aria-hidden");
      homeHero.classList.remove("kinetic-photo-hero");
      homeHero.removeAttribute("aria-roledescription");
      homeHero.removeAttribute("aria-label");
      homeHero.style.removeProperty("--kinetic-progress");
      root.style.removeProperty("--kinetic-page-progress");
    };
  }, [props.route.section, props.site.institution, props.site.labName, props.site.piName, props.site.slug]);

  return (
    <div className={styles.root} ref={rootRef}>
      <PhotoLabDesign {...props} />
    </div>
  );
}
