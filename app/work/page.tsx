import type { Metadata } from "next";
import MarketingShell from "@/components/marketing/MarketingShell";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Selected work",
  description: "Selected LabNarrative website concepts for scientific laboratories.",
};

const projects = [
  {
    field: "Molecular oncology",
    design: "Bourdon Full",
    title: "Litovchick Laboratory",
    description:
      "A structured, multi-page concept centred on DREAM-complex biology, quiescence, cancer dormancy and therapeutic vulnerabilities.",
    href: "https://litovchick.labnarrative.com",
    image:
      "https://www.masseycancercenter.org/media/massey-cancer-center/massey-media/Litovchick_Larisa.jpg",
  },
  {
    field: "Cancer evolution",
    design: "Scientific editorial",
    title: "Cancer Evolution Laboratory",
    description:
      "A clear research identity connecting TP53, YB-1, genomic instability, metastasis and precision medicine.",
    href: "https://mehta.labnarrative.com",
    image: "https://www.waikato.ac.nz/assets/4301564.jpeg",
  },
  {
    field: "Retinal cancer and regeneration",
    design: "Editorial Image v1",
    title: "Bremner Laboratory",
    description:
      "A bright, image-led system built around binary YAP states, transformation, retinoblastoma and functional genomics.",
    href: "/start",
    image:
      "https://umhkpflyzlifiufvejwr.supabase.co/storage/v1/object/public/labnarrative-images/rod-bremner/homepage-hero/1785746226962-2f486e62-57bb-4182-a382-180fd5317d2e.jpg",
  },
];

export default function WorkPage() {
  return (
    <MarketingShell>
      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Selected work</p>
        <h1>Design systems shaped around the science.</h1>
        <p>
          These independent concepts demonstrate how the same LabNarrative platform can support
          distinct laboratories, narratives and visual identities.
        </p>
      </section>
      <section className={styles.contentSection}>
        <div className={styles.workGrid}>
          {projects.map((project) => (
            <article className={styles.workCard} key={project.title}>
              <div className={styles.workImage}>
                <img src={project.image} alt="" />
              </div>
              <div className={styles.workCopy}>
                <div className={styles.workMeta}>
                  <span>{project.field}</span>
                  <span>{project.design}</span>
                </div>
                <h3>{project.title}</h3>
                <p>{project.description}</p>
                <a className={styles.workLink} href={project.href}>
                  {project.href.startsWith("http") ? "Open concept →" : "Discuss this direction →"}
                </a>
              </div>
            </article>
          ))}
        </div>
        <div className={styles.contentNarrow} style={{ marginTop: "48px" }}>
          <p>
            Concepts marked as independent are speculative demonstrations and are not official
            laboratory websites unless stated otherwise.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
