import { useState, useRef, useEffect } from "react";
import styles from "./SkillsView.module.css";

interface SkillInfo {
  id: string;
  description: string;
}

async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch("/api/skills");
  if (!res.ok) return [];
  const data = await res.json() as { skills: SkillInfo[] };
  return data.skills;
}

async function runSkill(id: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(id)}/run`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}

function SkillRow({ skill }: { skill: SkillInfo }): React.JSX.Element {
  const [state, setState] = useState<"idle" | "running" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRun = (): void => {
    setState("running");
    void runSkill(skill.id)
      .then(() => {
        setState("ok");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 3000);
      })
      .catch((e: unknown) => {
        setErrMsg(e instanceof Error ? e.message : String(e));
        setState("err");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 5000);
      });
  };

  return (
    <div className={styles.skillRow}>
      <div className={styles.skillInfo}>
        <code className={styles.skillId}>{skill.id}</code>
        <span className={styles.skillDesc}>{skill.description}</span>
      </div>
      <div className={styles.skillActions}>
        <button
          className={styles.runBtn}
          onClick={handleRun}
          disabled={state === "running"}
        >
          {state === "running" ? "运行中…" : "▶ 运行"}
        </button>
        {state === "ok" && <span className={styles.runOk}>✓ 完成</span>}
        {state === "err" && <span className={styles.runErr} title={errMsg}>✗ {errMsg}</span>}
      </div>
    </div>
  );
}

/** Dedicated Skills tab — lists registered skills and allows manual runs. */
export function SkillsView(): React.JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([]);

  useEffect(() => { void fetchSkills().then(setSkills); }, []);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h2 className={styles.title}>Skills</h2>
        {skills.length === 0 && <p className={styles.empty}>无已注册 skill</p>}
        {skills.map((s) => <SkillRow key={s.id} skill={s} />)}
      </div>
    </div>
  );
}
