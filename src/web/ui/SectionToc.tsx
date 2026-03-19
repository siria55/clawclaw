import styles from "./SectionToc.module.css";

export interface SectionTocItem {
  id: string;
  label: string;
  hint?: string;
}

interface SectionTocProps {
  title?: string;
  items: SectionTocItem[];
}

/** Sticky in-page table of contents for long WebUI tabs. */
export function SectionToc({ title = "页内导航", items }: SectionTocProps): React.JSX.Element {
  const jumpTo = (id: string): void => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className={styles.toc} aria-label={title}>
      <div className={styles.title}>{title}</div>
      <div className={styles.list}>
        {items.map((item) => (
          <button key={item.id} type="button" className={styles.item} onClick={() => jumpTo(item.id)}>
            <span className={styles.label}>{item.label}</span>
            {item.hint && <span className={styles.hint}>{item.hint}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
