import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { generateDraft, estateChecklist, type WillData } from "@shared/estate.mjs";
import { Card, CardHead, Chip, Label, Button } from "../components/ui";
import { Reveal } from "../components/motion";
import { useLocal } from "../lib/useLocal";
import { unlock, persist, vaultExists, exportBlob, type OpenVault, type VaultDoc } from "../lib/vault";

/* ---------------------------------------------------------------------------
   Will & Vault.

   The draft comes from @shared/estate.mjs — the same generator the server
   uses. The vault is AES-256-GCM under a PBKDF2-stretched passphrase, held in
   memory only. Nothing on this page is uploaded anywhere.
--------------------------------------------------------------------------- */

const WILL_STORE = "myfin.will.v1";

const DEFAULT_WILL: WillData = {
  fullName: "", fatherName: "", address: "", city: "", age: "", occupation: "",
  executor: { name: "", relation: "", address: "" },
  guardian: { name: "", relation: "" },
  witnesses: [{ name: "", address: "" }, { name: "", address: "" }],
  beneficiaries: [{ name: "", relation: "", age: "" }],
  assets: [{ type: "", description: "", beneficiary: "", sharePct: "" }],
};

const CATEGORIES = [
  "IDENTITY", "BANK", "INVESTMENT", "INSURANCE", "PROPERTY",
  "LOAN", "TAX", "NOMINEE", "WILL", "OTHER",
];

const Field = ({ label, value, onChange, placeholder, wide }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; wide?: boolean;
}) => (
  <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
    <Label>{label}</Label>
    <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] outline-none transition-colors focus:border-ink" />
  </label>
);

/* ============================ will wizard ================================ */
function WillWizard({ W, set, docs }: { W: WillData; set: (p: Partial<WillData>) => void; docs: VaultDoc[] }) {
  const draft = useMemo(() => generateDraft(W), [W]);

  const rows = <K extends "beneficiaries" | "assets">(key: K) => (W[key] ?? []) as any[];
  const patchRow = (key: "beneficiaries" | "assets", i: number, field: string, v: string) => {
    const next = [...rows(key)];
    next[i] = { ...next[i], [field]: v };
    set({ [key]: next } as Partial<WillData>);
  };
  const addRow = (key: "beneficiaries" | "assets", blank: any) => set({ [key]: [...rows(key), blank] } as Partial<WillData>);
  const delRow = (key: "beneficiaries" | "assets", i: number) =>
    set({ [key]: rows(key).filter((_, j) => j !== i) } as Partial<WillData>);

  const download = () => {
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `will-draft-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const hasWill = !!(W.fullName && W.executor?.name && (W.assets ?? []).some((a) => a.description));

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHead title="You" sub="the testator" />
          <div className="grid gap-3.5 px-5 py-4 sm:grid-cols-2">
            <Field label="Full name" value={W.fullName ?? ""} onChange={(v) => set({ fullName: v })} placeholder="As on your PAN" />
            <Field label="Father's name" value={W.fatherName ?? ""} onChange={(v) => set({ fatherName: v })} />
            <Field label="Age" value={String(W.age ?? "")} onChange={(v) => set({ age: v })} />
            <Field label="Occupation" value={W.occupation ?? ""} onChange={(v) => set({ occupation: v })} />
            <Field label="Address" wide value={W.address ?? ""} onChange={(v) => set({ address: v })} />
            <Field label="City" value={W.city ?? ""} onChange={(v) => set({ city: v })} />
          </div>
        </Card>

        <Card>
          <CardHead title="Executor" sub="who will carry the Will out" />
          <div className="grid gap-3.5 px-5 py-4 sm:grid-cols-2">
            <Field label="Name" value={W.executor?.name ?? ""} onChange={(v) => set({ executor: { ...W.executor, name: v } })} />
            <Field label="Relation" value={W.executor?.relation ?? ""} onChange={(v) => set({ executor: { ...W.executor, relation: v } })} />
            <Field label="Address" wide value={W.executor?.address ?? ""} onChange={(v) => set({ executor: { ...W.executor, address: v } })} />
          </div>
        </Card>

        <Card>
          <CardHead title="Beneficiaries" right={<Button onClick={() => addRow("beneficiaries", { name: "", relation: "", age: "" })}>Add</Button>} />
          <div className="space-y-2.5 px-5 py-4">
            {rows("beneficiaries").map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_70px_32px] gap-2">
                {(["name", "relation", "age"] as const).map((f) => (
                  <input key={f} value={b[f] ?? ""} placeholder={f[0].toUpperCase() + f.slice(1)}
                    onChange={(e) => patchRow("beneficiaries", i, f, e.target.value)}
                    className="border border-line-2 bg-paper px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink" />
                ))}
                <button onClick={() => delRow("beneficiaries", i)}
                  className="border border-line-2 text-ink-faint transition-colors hover:border-down hover:text-down">×</button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Assets" sub="what goes to whom" right={<Button onClick={() => addRow("assets", { type: "", description: "", beneficiary: "", sharePct: "" })}>Add</Button>} />
          <div className="space-y-2.5 px-5 py-4">
            {rows("assets").map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.4fr_1fr_66px_32px] gap-2">
                <input value={a.type ?? ""} placeholder="Type" onChange={(e) => patchRow("assets", i, "type", e.target.value)}
                  className="border border-line-2 bg-paper px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink" />
                <input value={a.description ?? ""} placeholder="Description" onChange={(e) => patchRow("assets", i, "description", e.target.value)}
                  className="border border-line-2 bg-paper px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink" />
                <input value={a.beneficiary ?? ""} placeholder="Goes to" onChange={(e) => patchRow("assets", i, "beneficiary", e.target.value)}
                  className="border border-line-2 bg-paper px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink" />
                <input value={String(a.sharePct ?? "")} placeholder="%" onChange={(e) => patchRow("assets", i, "sharePct", e.target.value)}
                  className="border border-line-2 bg-paper px-2.5 py-1.5 text-[12.5px] tnum outline-none focus:border-ink" />
                <button onClick={() => delRow("assets", i)}
                  className="border border-line-2 text-ink-faint transition-colors hover:border-down hover:text-down">×</button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Guardian" sub="for minor beneficiaries, if any" />
          <div className="grid gap-3.5 px-5 py-4 sm:grid-cols-2">
            <Field label="Name" value={W.guardian?.name ?? ""} onChange={(v) => set({ guardian: { ...W.guardian, name: v } })} />
            <Field label="Relation" value={W.guardian?.relation ?? ""} onChange={(v) => set({ guardian: { ...W.guardian, relation: v } })} />
          </div>
        </Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHead title="Draft" sub="regenerated as you type"
            right={<div className="flex gap-2">
              <Button onClick={() => window.print()}>Print</Button>
              <Button onClick={download} active>Download</Button>
            </div>} />
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-[11.5px] leading-[1.7] text-ink-dim">
            {draft}
          </pre>
          <div className="border-t border-line px-5 py-3.5 text-[11.5px] leading-relaxed text-ink-faint">
            A starting draft, not an executed Will. In India a Will must be signed by you and attested by two
            witnesses who are not beneficiaries, both present at the same time. Registration is optional but makes
            the document far harder to challenge. Have a lawyer read it before you sign.
          </div>
        </Card>

        <Checklist hasWill={hasWill} docs={docs} />
      </div>
    </div>
  );
}

/* ============================== checklist ================================ */
function Checklist({ hasWill, docs }: { hasWill: boolean; docs: VaultDoc[] }) {
  const items = useMemo(
    () => estateChecklist({ hasWill, vaultCategories: [...new Set(docs.map((d) => d.category))], residency: "RESIDENT" }),
    [hasWill, docs],
  );
  const done = items.filter((i) => i.done).length;

  return (
    <Card>
      <CardHead title="Estate checklist" right={<Chip tone={done === items.length ? "up" : "neutral"}>{done} of {items.length} done</Chip>} />
      <div className="divide-y divide-line">
        {items.map((i) => (
          <div key={i.item} className="flex gap-3 px-5 py-3.5">
            <div className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center border text-[10px] leading-none
              ${i.done ? "border-up bg-up text-paper" : "border-line-2 text-transparent"}`}>✓</div>
            <div>
              <b className="text-[12.5px]">{i.item}</b>
              {i.manual && <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">check yourself</span>}
              <div className="mt-0.5 text-[12px] leading-relaxed text-ink-dim">{i.why}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ================================ vault ================================== */
function Vault({ vault, setVault }: { vault: OpenVault | null; setVault: (v: OpenVault | null) => void }) {
  const [pass, setPass] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ category: "IDENTITY", title: "", body: "" });

  useEffect(() => {
    setHint(vaultExists()
      ? "A vault already exists in this browser — enter its passphrase to open it."
      : "No vault yet. The passphrase you choose now becomes the only way in.");
  }, []);

  const doUnlock = async () => {
    if (pass.length < 8) { setHint("Use at least 8 characters."); return; }
    setBusy(true);
    const v = await unlock(pass);
    setBusy(false);
    if (!v) { setHint("That passphrase does not decrypt this vault."); return; }
    setPass("");
    setVault(v);
  };

  const add = async () => {
    if (!vault || !draft.title.trim()) return;
    const next = { ...vault, docs: [...vault.docs, { ...draft, title: draft.title.trim(), body: draft.body.trim(), at: Date.now() }] };
    await persist(next);
    setVault(next);
    setDraft({ category: draft.category, title: "", body: "" });
  };

  const remove = async (i: number) => {
    if (!vault) return;
    const next = { ...vault, docs: vault.docs.filter((_, j) => j !== i) };
    await persist(next);
    setVault(next);
  };

  const exportVault = () => {
    const raw = exportBlob();
    if (!raw) return;
    const blob = new Blob([raw], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `myfinancial-vault-encrypted-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!vault) {
    return (
      <Card className="mx-auto mt-5 max-w-xl">
        <CardHead title="Locked" />
        <div className="px-5 py-6">
          <p className="text-[13px] leading-relaxed text-ink-dim">{hint}</p>
          <div className="mt-4 flex gap-2">
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doUnlock()} placeholder="Passphrase"
              className="flex-1 border border-line-2 bg-paper px-3 py-2 text-[13px] outline-none focus:border-ink" />
            <Button onClick={doUnlock} active>{busy ? "Deriving key…" : "Unlock"}</Button>
          </div>
          <div className="mt-5 text-[11.5px] leading-relaxed text-ink-faint">
            The passphrase is stretched with PBKDF2 (210,000 rounds of HMAC-SHA256) into an AES-256-GCM key that
            exists only in this tab's memory. Only the ciphertext is written to this browser's storage. There is no
            recovery path and no reset link — if there were, it would work for someone else too.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="mt-5 space-y-6">
      <Card>
        <CardHead title="Add a document" sub="reference details, not scans — account numbers, policy numbers, where things are kept"
          right={<Button onClick={() => setVault(null)}>Lock</Button>} />
        <div className="grid gap-3.5 px-5 py-4 sm:grid-cols-[160px_1fr]">
          <label className="block">
            <Label>Category</Label>
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] outline-none focus:border-ink">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <Field label="Title" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })}
            placeholder="e.g. HDFC savings account — Koramangala" />
          <label className="block sm:col-span-2">
            <Label>Details</Label>
            <textarea value={draft.body} rows={3} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="mt-1.5 w-full border border-line-2 bg-paper px-3 py-2 text-[13px] outline-none focus:border-ink"
              placeholder="Account number, nominee, where the passbook is kept…" />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <Button onClick={add} active>Add to vault</Button>
            <Button onClick={exportVault}>Export encrypted backup</Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Stored" right={<Chip>{vault.docs.length}</Chip>} />
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                {["Category", "Title", "Details", "Added", ""].map((h) => (
                  <th key={h} className="border-b border-line px-4 py-2.5 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vault.docs.length ? vault.docs.map((d, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">{d.category.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5 font-semibold">{d.title}</td>
                  <td className="max-w-[420px] px-4 py-2.5 text-ink-dim">{d.body}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-faint tnum">{new Date(d.at).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => remove(i)} className="text-ink-faint transition-colors hover:text-down">×</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="px-4 py-7 text-ink-dim">Nothing stored yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ================================= page ================================== */
export default function Estate() {
  const [W, setW] = useLocal<WillData>(WILL_STORE, DEFAULT_WILL);
  const [vault, setVault] = useState<OpenVault | null>(null);
  const [params, setParams] = useSearchParams();
  const tab = params.get("t") ?? "will";

  return (
    <>
      <section className="pt-12 pb-4">
        <Reveal>
          <Label className="mb-3">Will &amp; vault</Label>
          <h1 className="text-[clamp(1.9rem,4.2vw,3rem)] font-extrabold leading-[1.03] tracking-[-0.04em]">
            The part everyone <em className="font-serif font-normal italic tracking-tight">postpones</em>.
          </h1>
          <p className="mt-3 max-w-[78ch] text-[14px] leading-relaxed text-ink-dim">
            A Will draft that fills in as you type, a checklist of what else needs doing, and an encrypted place to
            record where everything is kept. All of it stays in this browser — the vault is AES-256-GCM under a key
            derived from your passphrase, and the passphrase is never stored.
          </p>
        </Reveal>
      </section>

      <Reveal delay={0.05}>
        <div className="flex flex-wrap gap-2 border-b border-line pb-4">
          {([["will", "Will wizard"], ["vault", "Document vault"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setParams(id === "will" ? {} : { t: id }, { replace: true })}
              className={`border px-3.5 py-2 text-[12px] transition-colors
                ${tab === id ? "border-ink bg-ink text-paper font-semibold" : "border-line-2 text-ink-dim hover:border-ink hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      </Reveal>

      {tab === "will"
        ? <WillWizard W={W} set={setW} docs={vault?.docs ?? []} />
        : <Vault vault={vault} setVault={setVault} />}
    </>
  );
}
