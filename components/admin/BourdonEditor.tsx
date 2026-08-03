"use client";

import { useMemo, useState, type ReactNode } from "react";
import ImageUploadField from "@/components/admin/ImageUploadField";
import {
  createDefaultBourdonPages,
  defaultBourdonDesignSettings,
  getBourdonDesignSettings,
  getBourdonPages,
  type BourdonDesignSettings,
  type BourdonPages,
  type LabMember,
  type LabSite,
  type Opportunity,
  type Publication,
  type ResearchProject,
} from "@/lib/sites";

type SiteStatus = "draft" | "concept" | "live" | "archived";
type Tab = "home" | "research" | "publications" | "members" | "join" | "contact" | "design";
type PreviewSection = Exclude<Tab, "design">;

const tabs: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "research", label: "Research" },
  { id: "publications", label: "Publications" },
  { id: "members", label: "Members" },
  { id: "join", label: "Join" },
  { id: "contact", label: "Contact" },
  { id: "design", label: "Design" },
];

function cleanSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function Field({ label, value, onChange, placeholder, required = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
    </label>
  );
}

function SelectField<T extends string | number>({ label, value, onChange, options, help }: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  help?: string;
}) {
  return (
    <label className="admin-field design-option-field">
      <span>{label}</span>
      <select value={String(value)} onChange={(event) => {
        const selected = options.find((option) => String(option.value) === event.target.value);
        if (selected) onChange(selected.value);
      }}>
        {options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
      {help && <small>{help}</small>}
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 4, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="admin-field admin-field-wide">
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} placeholder={placeholder} />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="advanced-editor-section">
      <h2>{title}</h2>
      <div className="advanced-editor-section-body">{children}</div>
    </section>
  );
}

function blankProject(index: number): ResearchProject {
  return {
    slug: `research-programme-${index + 1}`,
    title: "",
    summary: "",
    question: "",
    body: [""],
    methods: [],
    papers: [],
    figureImage: "",
    figureCaption: "",
  };
}

function blankMember(index: number): LabMember {
  return {
    name: "",
    role: index === 0 ? "Principal Investigator" : "Researcher",
    bio: "",
    image: "",
    href: "",
  };
}

function blankPublication(): Publication {
  return { title: "", journal: "", year: "", href: "" };
}

function blankOpportunity(index: number): Opportunity {
  const defaults = ["Postgraduate study", "Postdoctoral research", "Collaborate with us"];
  return { title: defaults[index] || "", status: "", description: "", linkLabel: "", href: "" };
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function BourdonEditor({
  content,
  status,
  onContentChange,
  onStatusChange,
  onPreviewSectionChange,
}: {
  content: LabSite;
  status: SiteStatus;
  onContentChange: (content: LabSite) => void;
  onStatusChange: (status: SiteStatus) => void;
  onPreviewSectionChange?: (section: PreviewSection) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const pages = useMemo(() => getBourdonPages(content), [content]);
  const research = content.research ?? [];
  const members = content.members ?? [];
  const opportunities = content.opportunities ?? [];
  const designSettings = useMemo(() => getBourdonDesignSettings(content), [content]);

  function replace(next: Partial<LabSite>) {
    onContentChange({ ...content, ...next });
  }

  function replacePages(nextPages: BourdonPages) {
    replace({ pages: nextPages });
  }

  function patchDesignSettings(patch: Partial<BourdonDesignSettings>) {
    replace({
      design: {
        key: "bourdon-full",
        version: 3,
        settings: { ...designSettings, ...patch },
      },
    });
  }

  function restoreDesignDefaults() {
    replace({
      design: {
        key: "bourdon-full",
        version: 3,
        settings: { ...defaultBourdonDesignSettings },
      },
    });
  }

  function patchPage<K extends keyof BourdonPages>(page: K, patch: Partial<BourdonPages[K]>) {
    replacePages({ ...pages, [page]: { ...pages[page], ...patch } });
  }

  function syncResearch(next: ResearchProject[]) {
    replace({
      research: next,
      projects: next.map((item) => ({ title: item.title, description: item.summary })),
    });
  }

  function syncMembers(next: LabMember[]) {
    replace({
      members: next,
      team: next.map((item) => ({ name: item.name, role: item.role })),
    });
  }

  function resetPageDefaults() {
    replace({ pages: createDefaultBourdonPages(content) });
  }

  return (
    <div className="advanced-editor">
      <div className="advanced-editor-top">
        <div>
          <strong>Website editor</strong>
          <span>Advanced Bourdon Full editor · design version 3</span>
        </div>
        <button type="button" onClick={resetPageDefaults}>Restore page-label defaults</button>
      </div>

      <nav className="advanced-editor-tabs" aria-label="Website page editor">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id !== "design") onPreviewSectionChange?.(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "home" && (
        <div className="advanced-editor-page">
          <h1>Home page</h1>
          <Section title="Website identity and publishing">
            <div className="admin-form-grid">
              <Field label="Subdomain slug" value={content.slug} onChange={(value) => replace({ slug: cleanSlug(value) })} placeholder="bourdon-full-test" required />
              <label className="admin-field">
                <span>Website status</span>
                <select value={status} onChange={(event) => onStatusChange(event.target.value as SiteStatus)}>
                  <option value="draft">Draft — private administrator-only work</option>
                  <option value="concept">Concept — public outreach concept for a prospective PI</option>
                  <option value="live">Client — approved official client website</option>
                  <option value="archived">Archived — retired and hidden</option>
                </select>
              </label>
              <Field label="Principal investigator" value={content.piName} onChange={(value) => replace({ piName: value })} required />
              <Field label="Academic title" value={content.title} onChange={(value) => replace({ title: value })} />
              <Field label="Laboratory name" value={content.labName} onChange={(value) => replace({ labName: value })} required />
              <Field label="Institution" value={content.institution} onChange={(value) => replace({ institution: value })} />
            </div>
          </Section>

          <Section title="Header and navigation">
            <div className="admin-form-grid">
              <Field label="Lab name" value={content.labName} onChange={(value) => replace({ labName: value })} />
              <Field label="Subtitle" value={content.labSubtitle || ""} onChange={(value) => replace({ labSubtitle: value })} />
              {Object.entries(pages.navigation).map(([key, value]) => (
                <Field key={key} label={`${key[0].toUpperCase()}${key.slice(1)} tab`} value={value} onChange={(next) => patchPage("navigation", { [key]: next })} />
              ))}
            </div>
            <ImageUploadField label="Top-left circular image" value={pages.home.topPortrait} onChange={(value) => patchPage("home", { topPortrait: value })} siteSlug={content.slug} folder="header-portrait" alt={`${content.piName} portrait`} />
          </Section>

          <Section title="Opening section">
            <div className="admin-form-grid">
              <Field label="Topic line" value={pages.home.topicLine} onChange={(value) => { patchPage("home", { topicLine: value }); replace({ eyebrow: value }); }} />
              <Field label="Main heading" value={pages.home.mainHeading} onChange={(value) => { patchPage("home", { mainHeading: value }); replace({ headline: value }); }} required />
              <TextArea label="Opening text" value={pages.home.openingText} onChange={(value) => { patchPage("home", { openingText: value }); replace({ introduction: value }); }} rows={5} />
              <div className="admin-inline-fields">
                <Field label="Research button" value={pages.home.researchButton} onChange={(value) => patchPage("home", { researchButton: value })} />
                <Field label="Publications button" value={pages.home.publicationsButton} onChange={(value) => patchPage("home", { publicationsButton: value })} />
              </div>
              <TextArea label="Research overview" value={pages.home.researchOverview} onChange={(value) => { patchPage("home", { researchOverview: value }); replace({ overview: value }); }} rows={6} />
              <div className="admin-inline-fields three">
                <Field label="Overview label" value={pages.home.overviewLabel} onChange={(value) => patchPage("home", { overviewLabel: value })} />
                <Field label="Overview heading" value={pages.home.overviewHeading} onChange={(value) => patchPage("home", { overviewHeading: value })} />
                <Field label="Overview link" value={pages.home.overviewLink} onChange={(value) => patchPage("home", { overviewLink: value })} />
              </div>
            </div>
            <ImageUploadField label="Homepage image" value={pages.home.homepageImage} onChange={(value) => { patchPage("home", { homepageImage: value }); replace({ heroImage: value }); }} siteSlug={content.slug} folder="homepage-hero" alt={`${content.labName} homepage`} />
          </Section>

          <Section title="Research programmes section">
            <div className="admin-form-grid">
              <Field label="Section label" value={pages.home.programmesLabel} onChange={(value) => patchPage("home", { programmesLabel: value })} />
              <Field label="Section heading" value={pages.home.programmesHeading} onChange={(value) => patchPage("home", { programmesHeading: value })} />
              <Field label="Programme link label" value={pages.home.programmeLinkLabel} onChange={(value) => patchPage("home", { programmeLinkLabel: value })} />
            </div>
          </Section>

          <Section title="Principal investigator section">
            <div className="admin-form-grid">
              <Field label="Section label" value={pages.home.piSectionLabel} onChange={(value) => patchPage("home", { piSectionLabel: value })} />
              <Field label="Name" value={pages.home.piName} onChange={(value) => { patchPage("home", { piName: value }); replace({ piName: value }); }} />
              <Field label="Role" value={pages.home.piRole} onChange={(value) => { patchPage("home", { piRole: value }); replace({ title: value }); }} />
              <TextArea label="Biography" value={pages.home.piBiography} onChange={(value) => patchPage("home", { piBiography: value })} rows={6} />
              <Field label="Member-page link" value={pages.home.piLinkLabel} onChange={(value) => patchPage("home", { piLinkLabel: value })} />
            </div>
            <ImageUploadField label="Principal investigator photo — lower home page" value={pages.home.piImage} onChange={(value) => patchPage("home", { piImage: value })} siteSlug={content.slug} folder="homepage-pi" alt={pages.home.piName} />
          </Section>

          <Section title="Join section">
            <div className="admin-form-grid">
              <Field label="Section label" value={pages.home.joinLabel} onChange={(value) => patchPage("home", { joinLabel: value })} />
              <Field label="Section heading" value={pages.home.joinHeading} onChange={(value) => patchPage("home", { joinHeading: value })} />
              <Field label="Button label" value={pages.home.joinButton} onChange={(value) => patchPage("home", { joinButton: value })} />
            </div>
          </Section>

          <Section title="Footer">
            <div className="admin-form-grid">
              <Field label="Laboratory name" value={pages.home.footerLabName} onChange={(value) => patchPage("home", { footerLabName: value })} />
              <Field label="Department" value={pages.home.footerDepartment} onChange={(value) => { patchPage("home", { footerDepartment: value }); replace({ department: value }); }} />
              <Field label="Institution" value={pages.home.footerInstitution} onChange={(value) => { patchPage("home", { footerInstitution: value }); replace({ institution: value }); }} />
              <Field label="Contact heading" value={pages.home.footerContactHeading} onChange={(value) => patchPage("home", { footerContactHeading: value })} />
              <Field label="Explore heading" value={pages.home.footerExploreHeading} onChange={(value) => patchPage("home", { footerExploreHeading: value })} />
              <Field label="Research link" value={pages.home.footerResearchLink} onChange={(value) => patchPage("home", { footerResearchLink: value })} />
              <Field label="Publications link" value={pages.home.footerPublicationsLink} onChange={(value) => patchPage("home", { footerPublicationsLink: value })} />
              <Field label="Join link" value={pages.home.footerJoinLink} onChange={(value) => patchPage("home", { footerJoinLink: value })} />
              <TextArea label="Footer note" value={pages.home.footerNote} onChange={(value) => patchPage("home", { footerNote: value })} rows={3} />
              <Field label="Email address" value={content.email || ""} onChange={(value) => replace({ email: value })} />
              <Field label="Telephone" value={content.phone || ""} onChange={(value) => replace({ phone: value })} />
            </div>
          </Section>

          <Section title="Visual theme">
            <div className="admin-color-grid">
              {Object.entries(content.theme).map(([key, value]) => (
                <label key={key} className="admin-color-field">
                  <span>{key}</span>
                  <div><input type="color" value={value} onChange={(event) => replace({ theme: { ...content.theme, [key]: event.target.value } })} /><input value={value} onChange={(event) => replace({ theme: { ...content.theme, [key]: event.target.value } })} /></div>
                </label>
              ))}
            </div>
          </Section>
        </div>
      )}

      {activeTab === "research" && (
        <div className="advanced-editor-page">
          <h1>Research programmes</h1>
          <Section title="Research page introduction">
            <div className="admin-form-grid">
              <Field label="Page label" value={pages.research.pageLabel} onChange={(value) => patchPage("research", { pageLabel: value })} />
              <Field label="Page heading" value={pages.research.pageHeading} onChange={(value) => patchPage("research", { pageHeading: value })} />
              <TextArea label="Introduction" value={pages.research.introduction} onChange={(value) => patchPage("research", { introduction: value })} rows={5} />
              <Field label="Question label" value={pages.research.questionLabel} onChange={(value) => patchPage("research", { questionLabel: value })} />
              <Field label="Programme link" value={pages.research.programmeLinkLabel} onChange={(value) => patchPage("research", { programmeLinkLabel: value })} />
            </div>
          </Section>
          <Section title="Programme detail pages">
            <div className="admin-form-grid">
              <Field label="Back link" value={pages.research.backLink} onChange={(value) => patchPage("research", { backLink: value })} />
              <Field label="Programme label" value={pages.research.programmeLabel} onChange={(value) => patchPage("research", { programmeLabel: value })} />
              <Field label="Question label" value={pages.research.questionLabel} onChange={(value) => patchPage("research", { questionLabel: value })} />
              <Field label="Next-programme label" value={pages.research.nextProgrammeLabel} onChange={(value) => patchPage("research", { nextProgrammeLabel: value })} />
              <Field label="Return link" value={pages.research.returnLink} onChange={(value) => patchPage("research", { returnLink: value })} />
            </div>
          </Section>
          <div className="advanced-list-heading"><h2>Research programme content</h2><button type="button" onClick={() => syncResearch([...research, blankProject(research.length)])}>+ Add programme</button></div>
          <div className="advanced-repeat-list">
            {research.map((project, index) => (
              <article key={`${project.slug}-${index}`}>
                <div className="advanced-repeat-title"><strong>Programme {index + 1}</strong><div><button type="button" onClick={() => syncResearch(moveItem(research, index, index - 1))} disabled={index === 0}>↑</button><button type="button" onClick={() => syncResearch(moveItem(research, index, index + 1))} disabled={index === research.length - 1}>↓</button><button type="button" className="danger" onClick={() => syncResearch(research.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div></div>
                <div className="admin-form-grid">
                  <Field label="Page address" value={project.slug} onChange={(value) => syncResearch(research.map((item, itemIndex) => itemIndex === index ? { ...item, slug: cleanSlug(value) } : item))} />
                  <Field label="Title" value={project.title} onChange={(value) => syncResearch(research.map((item, itemIndex) => itemIndex === index ? { ...item, title: value } : item))} />
                  <TextArea label="Summary" value={project.summary} onChange={(value) => syncResearch(research.map((item, itemIndex) => itemIndex === index ? { ...item, summary: value } : item))} rows={4} />
                  <TextArea label="Central question" value={project.question || ""} onChange={(value) => syncResearch(research.map((item, itemIndex) => itemIndex === index ? { ...item, question: value } : item))} rows={3} />
                </div>
                <ImageUploadField label="Research figure" value={project.figureImage || ""} onChange={(value) => syncResearch(research.map((item, itemIndex) => itemIndex === index ? { ...item, figureImage: value } : item))} siteSlug={content.slug} folder={`research-${project.slug || index + 1}`} alt={project.figureCaption || project.title} />
                <div className="admin-form-grid">
                  <Field label="Figure caption" value={project.figureCaption || ""} onChange={(value) => syncResearch(research.map((item, itemIndex) => itemIndex === index ? { ...item, figureCaption: value } : item))} />
                  <TextArea label="Extended text — one paragraph per line" value={(project.body || []).join("\n")} onChange={(value) => syncResearch(research.map((item, itemIndex) => itemIndex === index ? { ...item, body: value.split("\n") } : item))} rows={8} />
                  <TextArea label="Methods or approaches — one per line" value={(project.methods || []).join("\n")} onChange={(value) => syncResearch(research.map((item, itemIndex) => itemIndex === index ? { ...item, methods: value.split("\n") } : item))} rows={5} />
                  <TextArea label="Landmark papers — one per line" value={(project.papers || []).join("\n")} onChange={(value) => syncResearch(research.map((item, itemIndex) => itemIndex === index ? { ...item, papers: value.split("\n") } : item))} rows={5} />
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === "publications" && (
        <div className="advanced-editor-page">
          <h1>Publications</h1>
          <Section title="Page introduction">
            <div className="admin-form-grid">
              <Field label="Page label" value={pages.publications.pageLabel} onChange={(value) => patchPage("publications", { pageLabel: value })} />
              <Field label="Page heading" value={pages.publications.pageHeading} onChange={(value) => patchPage("publications", { pageHeading: value })} />
              <TextArea label="Introduction" value={pages.publications.introduction} onChange={(value) => patchPage("publications", { introduction: value })} rows={5} />
            </div>
          </Section>
          <Section title="Search and record controls">
            <div className="admin-form-grid">
              <Field label="Search label" value={pages.publications.searchLabel} onChange={(value) => patchPage("publications", { searchLabel: value })} />
              <Field label="Search placeholder" value={pages.publications.searchPlaceholder} onChange={(value) => patchPage("publications", { searchPlaceholder: value })} />
              <Field label="PubMed button" value={pages.publications.pubmedButton} onChange={(value) => patchPage("publications", { pubmedButton: value })} />
              <Field label="No-results message" value={pages.publications.noResults} onChange={(value) => patchPage("publications", { noResults: value })} />
              <Field label="Complete PubMed URL" value={content.pubmedUrl || ""} onChange={(value) => replace({ pubmedUrl: value })} />
            </div>
          </Section>
          <div className="advanced-list-heading"><h2>Publication list</h2><button type="button" onClick={() => replace({ publications: [...content.publications, blankPublication()] })}>+ Add publication</button></div>
          <div className="advanced-repeat-list compact">
            {content.publications.map((publication, index) => (
              <article key={`${publication.title}-${index}`}>
                <div className="advanced-repeat-title"><strong>Publication {index + 1}</strong><div><button type="button" onClick={() => replace({ publications: moveItem(content.publications, index, index - 1) })} disabled={index === 0}>↑</button><button type="button" onClick={() => replace({ publications: moveItem(content.publications, index, index + 1) })} disabled={index === content.publications.length - 1}>↓</button><button type="button" className="danger" onClick={() => replace({ publications: content.publications.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div></div>
                <div className="admin-form-grid">
                  <Field label="Year" value={publication.year} onChange={(value) => replace({ publications: content.publications.map((item, itemIndex) => itemIndex === index ? { ...item, year: value } : item) })} />
                  <Field label="Journal" value={publication.journal} onChange={(value) => replace({ publications: content.publications.map((item, itemIndex) => itemIndex === index ? { ...item, journal: value } : item) })} />
                  <TextArea label="Title" value={publication.title} onChange={(value) => replace({ publications: content.publications.map((item, itemIndex) => itemIndex === index ? { ...item, title: value } : item) })} rows={3} />
                  <Field label="Link" value={publication.href || ""} onChange={(value) => replace({ publications: content.publications.map((item, itemIndex) => itemIndex === index ? { ...item, href: value } : item) })} />
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === "members" && (
        <div className="advanced-editor-page">
          <h1>Lab members</h1>
          <Section title="Page introduction">
            <div className="admin-form-grid">
              <Field label="Page label" value={pages.members.pageLabel} onChange={(value) => patchPage("members", { pageLabel: value })} />
              <Field label="Page heading" value={pages.members.pageHeading} onChange={(value) => patchPage("members", { pageHeading: value })} />
              <TextArea label="Introduction" value={pages.members.introduction} onChange={(value) => patchPage("members", { introduction: value })} rows={5} />
              <Field label="Profile link label" value={pages.members.profileLinkLabel} onChange={(value) => patchPage("members", { profileLinkLabel: value })} />
              <Field label="Notice heading" value={pages.members.noticeHeading} onChange={(value) => patchPage("members", { noticeHeading: value })} />
              <TextArea label="Notice text" value={pages.members.noticeText} onChange={(value) => patchPage("members", { noticeText: value })} rows={4} />
            </div>
          </Section>
          <div className="advanced-list-heading"><h2>Member profiles</h2><button type="button" onClick={() => syncMembers([...members, blankMember(members.length)])}>+ Add member</button></div>
          <div className="advanced-repeat-list">
            {members.map((member, index) => (
              <article key={`${member.name}-${index}`}>
                <div className="advanced-repeat-title"><strong>{index === 0 ? "Principal investigator" : `Lab member ${index}`}</strong><div><button type="button" onClick={() => syncMembers(moveItem(members, index, index - 1))} disabled={index === 0}>↑</button><button type="button" onClick={() => syncMembers(moveItem(members, index, index + 1))} disabled={index === members.length - 1}>↓</button>{index > 0 && <button type="button" className="danger" onClick={() => syncMembers(members.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}</div></div>
                <div className="admin-form-grid">
                  <Field label="Name" value={member.name} onChange={(value) => syncMembers(members.map((item, itemIndex) => itemIndex === index ? { ...item, name: value } : item))} />
                  <Field label="Role" value={member.role} onChange={(value) => syncMembers(members.map((item, itemIndex) => itemIndex === index ? { ...item, role: value } : item))} />
                  <TextArea label="Biography" value={member.bio || ""} onChange={(value) => syncMembers(members.map((item, itemIndex) => itemIndex === index ? { ...item, bio: value } : item))} rows={5} />
                  <Field label="Profile link" value={member.href || ""} onChange={(value) => syncMembers(members.map((item, itemIndex) => itemIndex === index ? { ...item, href: value } : item))} />
                </div>
                <ImageUploadField label="Photograph" value={member.image || ""} onChange={(value) => syncMembers(members.map((item, itemIndex) => itemIndex === index ? { ...item, image: value } : item))} siteSlug={content.slug} folder={`member-${index + 1}`} alt={member.name || `Lab member ${index + 1}`} />
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === "join" && (
        <div className="advanced-editor-page">
          <h1>Join our lab</h1>
          <Section title="Page introduction">
            <div className="admin-form-grid">
              <Field label="Page label" value={pages.join.pageLabel} onChange={(value) => patchPage("join", { pageLabel: value })} />
              <Field label="Page heading" value={pages.join.pageHeading} onChange={(value) => patchPage("join", { pageHeading: value })} />
              <TextArea label="Introduction" value={pages.join.introduction} onChange={(value) => patchPage("join", { introduction: value })} rows={5} />
            </div>
          </Section>
          <Section title="Application guidance">
            <div className="admin-form-grid">
              <Field label="Section label" value={pages.join.guidanceLabel} onChange={(value) => patchPage("join", { guidanceLabel: value })} />
              <Field label="Section heading" value={pages.join.guidanceHeading} onChange={(value) => patchPage("join", { guidanceHeading: value })} />
              <TextArea label="Guidance text" value={pages.join.guidanceText} onChange={(value) => patchPage("join", { guidanceText: value })} rows={6} />
              <Field label="Contact button" value={pages.join.contactButton} onChange={(value) => patchPage("join", { contactButton: value })} />
            </div>
          </Section>
          <div className="advanced-list-heading"><h2>Opportunities</h2><button type="button" onClick={() => replace({ opportunities: [...opportunities, blankOpportunity(opportunities.length)] })}>+ Add opportunity</button></div>
          <div className="advanced-repeat-list compact">
            {opportunities.map((opportunity, index) => (
              <article key={`${opportunity.title}-${index}`}>
                <div className="advanced-repeat-title"><strong>Opportunity {index + 1}</strong><div><button type="button" onClick={() => replace({ opportunities: moveItem(opportunities, index, index - 1) })} disabled={index === 0}>↑</button><button type="button" onClick={() => replace({ opportunities: moveItem(opportunities, index, index + 1) })} disabled={index === opportunities.length - 1}>↓</button><button type="button" className="danger" onClick={() => replace({ opportunities: opportunities.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div></div>
                <div className="admin-form-grid">
                  <Field label="Title" value={opportunity.title} onChange={(value) => replace({ opportunities: opportunities.map((item, itemIndex) => itemIndex === index ? { ...item, title: value } : item) })} />
                  <Field label="Status" value={opportunity.status || ""} onChange={(value) => replace({ opportunities: opportunities.map((item, itemIndex) => itemIndex === index ? { ...item, status: value } : item) })} />
                  <TextArea label="Description" value={opportunity.description} onChange={(value) => replace({ opportunities: opportunities.map((item, itemIndex) => itemIndex === index ? { ...item, description: value } : item) })} rows={5} />
                  <Field label="Button label" value={opportunity.linkLabel || ""} onChange={(value) => replace({ opportunities: opportunities.map((item, itemIndex) => itemIndex === index ? { ...item, linkLabel: value } : item) })} />
                  <Field label="Button link" value={opportunity.href || ""} onChange={(value) => replace({ opportunities: opportunities.map((item, itemIndex) => itemIndex === index ? { ...item, href: value } : item) })} />
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === "contact" && (
        <div className="advanced-editor-page">
          <h1>Contact and PI</h1>
          <Section title="Contact page introduction">
            <div className="admin-form-grid">
              <Field label="Page label" value={pages.contact.pageLabel} onChange={(value) => patchPage("contact", { pageLabel: value })} />
              <Field label="Page heading" value={pages.contact.pageHeading} onChange={(value) => patchPage("contact", { pageHeading: value })} />
              <TextArea label="Introduction" value={pages.contact.introduction} onChange={(value) => patchPage("contact", { introduction: value })} rows={5} />
            </div>
          </Section>
          <Section title="Principal investigator">
            <div className="admin-form-grid">
              <Field label="PI name" value={pages.contact.piName} onChange={(value) => { patchPage("contact", { piName: value }); replace({ piName: value }); }} />
              <Field label="PI role" value={pages.contact.piRole} onChange={(value) => { patchPage("contact", { piRole: value }); replace({ title: value }); }} />
              <TextArea label="PI biography" value={pages.contact.piBiography} onChange={(value) => patchPage("contact", { piBiography: value })} rows={6} />
            </div>
            <ImageUploadField label="PI photograph" value={pages.contact.piImage} onChange={(value) => patchPage("contact", { piImage: value })} siteSlug={content.slug} folder="contact-pi" alt={pages.contact.piName} />
          </Section>
          <Section title="Institution and contact details">
            <div className="admin-form-grid">
              <Field label="Institution" value={pages.contact.institution} onChange={(value) => { patchPage("contact", { institution: value }); replace({ institution: value }); }} />
              <Field label="Department" value={pages.contact.department} onChange={(value) => { patchPage("contact", { department: value }); replace({ department: value }); }} />
              <TextArea label="Address" value={pages.contact.address} onChange={(value) => { patchPage("contact", { address: value }); replace({ address: value }); }} rows={4} />
              <Field label="Email" value={pages.contact.email} onChange={(value) => { patchPage("contact", { email: value }); replace({ email: value }); }} />
              <Field label="Phone" value={pages.contact.phone} onChange={(value) => { patchPage("contact", { phone: value }); replace({ phone: value }); }} />
              <Field label="Official profile" value={pages.contact.officialProfile} onChange={(value) => { patchPage("contact", { officialProfile: value }); replace({ profileUrl: value }); }} />
              <Field label="PubMed record" value={pages.contact.pubmedRecord} onChange={(value) => { patchPage("contact", { pubmedRecord: value }); replace({ pubmedUrl: value }); }} />
            </div>
          </Section>
          <Section title="Contact labels and buttons">
            <div className="admin-form-grid">
              <Field label="Laboratory label" value={pages.contact.laboratoryLabel} onChange={(value) => patchPage("contact", { laboratoryLabel: value })} />
              <Field label="Email label" value={pages.contact.emailLabel} onChange={(value) => patchPage("contact", { emailLabel: value })} />
              <Field label="Telephone label" value={pages.contact.telephoneLabel} onChange={(value) => patchPage("contact", { telephoneLabel: value })} />
              <Field label="Profile label" value={pages.contact.profileLabel} onChange={(value) => patchPage("contact", { profileLabel: value })} />
              <Field label="Profile link text" value={pages.contact.profileLinkText} onChange={(value) => patchPage("contact", { profileLinkText: value })} />
              <Field label="Email button" value={pages.contact.emailButton} onChange={(value) => patchPage("contact", { emailButton: value })} />
            </div>
          </Section>
          <Section title="Location strip">
            <div className="admin-form-grid">
              <Field label="Location name" value={pages.contact.locationName} onChange={(value) => patchPage("contact", { locationName: value })} />
              <Field label="Latitude" value={pages.contact.latitude} onChange={(value) => patchPage("contact", { latitude: value })} />
              <Field label="Longitude" value={pages.contact.longitude} onChange={(value) => patchPage("contact", { longitude: value })} />
              <Field label="Location suffix" value={pages.contact.locationSuffix} onChange={(value) => patchPage("contact", { locationSuffix: value })} />
            </div>
          </Section>
        </div>
      )}

      {activeTab === "design" && (
        <div className="advanced-editor-page">
          <div className="advanced-design-heading">
            <div>
              <h1>Design and layout</h1>
              <p>Choose controlled layout variations. The original Bourdon v2 composition remains the default.</p>
            </div>
            <button type="button" onClick={restoreDesignDefaults}>Restore Bourdon defaults</button>
          </div>

          <Section title="Homepage composition">
            <div className="admin-form-grid design-options-grid">
              <SelectField
                label="Hero layout"
                value={designSettings.homeHeroLayout}
                onChange={(value) => patchDesignSettings({ homeHeroLayout: value })}
                options={[
                  { value: "image-right", label: "Image on the right — Bourdon default" },
                  { value: "image-left", label: "Image on the left" },
                  { value: "text-only", label: "Text only" },
                ]}
                help="Controls the opening statement and hero-image position."
              />
              <SelectField
                label="Research programmes"
                value={designSettings.programmesLayout}
                onChange={(value) => patchDesignSettings({ programmesLayout: value })}
                options={[
                  { value: "grid", label: "Two-column editorial grid — default" },
                  { value: "rows", label: "Full-width programme rows" },
                ]}
                help="Changes only the homepage programme overview."
              />
              <SelectField
                label="Principal-investigator section"
                value={designSettings.piLayout}
                onChange={(value) => patchDesignSettings({ piLayout: value })}
                options={[
                  { value: "image-left", label: "Image on the left — default" },
                  { value: "image-right", label: "Image on the right" },
                  { value: "text-only", label: "Text only" },
                ]}
                help="The Members page remains independently structured."
              />
            </div>
          </Section>

          <Section title="Internal pages">
            <div className="admin-form-grid design-options-grid">
              <SelectField
                label="Research overview"
                value={designSettings.researchIndexLayout}
                onChange={(value) => patchDesignSettings({ researchIndexLayout: value })}
                options={[
                  { value: "image-right", label: "Figures on the right — default" },
                  { value: "alternating", label: "Alternating figure positions" },
                  { value: "text-only", label: "Text only" },
                ]}
                help="Detailed project pages continue to show their scientific figures."
              />
              <SelectField
                label="Research project narrative"
                value={designSettings.projectLayout}
                onChange={(value) => patchDesignSettings({ projectLayout: value })}
                options={[
                  { value: "split", label: "Question and narrative side by side — default" },
                  { value: "stacked", label: "Question above narrative" },
                ]}
                help="Useful for projects with longer central questions."
              />
              <SelectField
                label="Additional-member columns"
                value={designSettings.membersColumns}
                onChange={(value) => patchDesignSettings({ membersColumns: value })}
                options={[
                  { value: 2, label: "Two columns" },
                  { value: 3, label: "Three columns — default" },
                  { value: 4, label: "Four columns" },
                ]}
                help="The principal investigator always remains in the leading profile section."
              />
            </div>
          </Section>

          <Section title="Global appearance">
            <div className="admin-form-grid design-options-grid">
              <SelectField
                label="Page-introduction style"
                value={designSettings.pageIntroStyle}
                onChange={(value) => patchDesignSettings({ pageIntroStyle: value })}
                options={[
                  { value: "navy", label: "Navy — Bourdon default" },
                  { value: "teal", label: "Teal" },
                  { value: "paper", label: "Light paper" },
                ]}
                help="Applies consistently to Research, Publications, Members, Join and Contact."
              />
              <SelectField
                label="Section spacing"
                value={designSettings.sectionSpacing}
                onChange={(value) => patchDesignSettings({ sectionSpacing: value })}
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "balanced", label: "Balanced — default" },
                  { value: "generous", label: "Generous" },
                ]}
                help="Adjusts vertical rhythm without changing typography or content."
              />
              <SelectField
                label="Corner treatment"
                value={designSettings.cornerStyle}
                onChange={(value) => patchDesignSettings({ cornerStyle: value })}
                options={[
                  { value: "square", label: "Square — Bourdon default" },
                  { value: "soft", label: "Soft rounded corners" },
                ]}
                help="Applies to images, buttons, cards and the private-preview badge."
              />
            </div>
          </Section>

          <aside className="advanced-design-note">
            <strong>Safe design system</strong>
            <p>These choices are stored with this website only. They do not change other concepts, the locked Bourdon draft, or any legacy subdomain.</p>
          </aside>
        </div>
      )}

    </div>
  );
}
