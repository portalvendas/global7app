'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Nav } from '@/components/nav';
import { isG7, useMe } from '@/lib/session';

type ProjectType = 'SPLICE' | 'CONSTRUCTION';
interface Ref { id: string; name?: string }
interface ServiceRow {
  id?: string; code: string; description: string; unit: string;
  clientValue: string; subValue: string;
}
interface Project {
  id: string; code: string; projectType: ProjectType; projectSource?: string | null; currency: string; status: string;
  client?: Ref | null;
  subcontractors?: { company: Ref }[];
  services?: { id: string; code: string; description: string; unit?: string | null; clientValue: string | number; subValue: string | number }[];
}
interface Company { id: string; name: string; type: 'OPERATOR' | 'SUBCONTRACTOR' | 'CLIENT' }

// Linha vazia de serviço
const emptyService = (): ServiceRow => ({ code: '', description: '', unit: '', clientValue: '', subValue: '' });

// Autosave de rascunho de projeto NOVO (localStorage).
const DRAFT_KEY = 'g7_projeto_draft';
interface Draft {
  code: string; projectType: ProjectType; projectSource: string;
  clientCompanyId: string; subIds: string[]; services: ServiceRow[];
}
function loadDraft(): Draft | null {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? (JSON.parse(raw) as Draft) : null; } catch { return null; }
}
function saveDraft(d: Draft) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* quota/priv */ } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ } }

// Coluna-alvo ao importar PDF: valor cheio (recebido do cliente) ou repasse (pago ao sub).
type Target = 'clientValue' | 'subValue';

interface ParsedLine { code: string; description: string; unit: string; value: number }

export default function ProjetosPage() {
  const { me, loading } = useMe();
  const [rows, setRows] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [code, setCode] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('SPLICE');
  const [projectSource, setProjectSource] = useState('');
  const [clientCompanyId, setClientCompanyId] = useState('');
  const [subIds, setSubIds] = useState<string[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([emptyService()]);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);
  // Import PDF
  const [importTarget, setImportTarget] = useState<Target>('clientValue');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');
  // Autosave (rascunho de projeto novo)
  const [draftStatus, setDraftStatus] = useState('');

  const load = useCallback(() => {
    setListError('');
    api<{ items: Project[] }>('/projects?pageSize=100')
      .then((r) => setRows(r.items))
      .catch((e) => setListError(e instanceof ApiError ? e.message : 'Falha ao carregar projetos'));
  }, []);
  useEffect(() => {
    if (!me) return;
    load();
    api<{ items: Company[] }>('/companies?pageSize=100').then((r) => setCompanies(r.items)).catch(() => {});
  }, [me, load]);

  // Autosave: salva rascunho do projeto NOVO enquanto o form está aberto (debounce).
  useEffect(() => {
    if (!showForm || editId) return; // só p/ criação
    const hasContent = !!(code || projectSource || clientCompanyId || subIds.length ||
      services.some((s) => s.code || s.description || s.clientValue || s.subValue));
    if (!hasContent) return;
    const t = setTimeout(() => {
      saveDraft({ code, projectType, projectSource, clientCompanyId, subIds, services });
      setDraftStatus('salvo');
    }, 600);
    return () => clearTimeout(t);
  }, [showForm, editId, code, projectType, projectSource, clientCompanyId, subIds, services]);

  const canEdit = me ? isG7(me.role) : false;
  const clients = companies.filter((c) => c.type === 'CLIENT');
  const subs = companies.filter((c) => c.type === 'SUBCONTRACTOR');

  function resetForm() {
    setCode(''); setProjectType('SPLICE'); setProjectSource(''); setClientCompanyId(''); setSubIds([]); setServices([emptyService()]);
    setError(''); setImportNote(''); setImportTarget('clientValue');
  }
  function applyDraft(d: Draft) {
    setCode(d.code || ''); setProjectType(d.projectType || 'SPLICE'); setProjectSource(d.projectSource || '');
    setClientCompanyId(d.clientCompanyId || ''); setSubIds(d.subIds || []);
    setServices(d.services && d.services.length ? d.services : [emptyService()]);
    setError(''); setImportNote(''); setImportTarget('clientValue');
  }
  function startCreate() {
    const draft = loadDraft();
    setEditId(null);
    if (draft) { applyDraft(draft); setDraftStatus('recuperado'); }
    else { resetForm(); setDraftStatus(''); }
    setShowForm(true);
  }
  function discardDraft() { clearDraft(); resetForm(); setDraftStatus(''); }
  function startEdit(p: Project) {
    setCode(p.code);
    setProjectType(p.projectType || 'SPLICE');
    setProjectSource(p.projectSource || '');
    setClientCompanyId(p.client?.id || '');
    setSubIds((p.subcontractors ?? []).map((s) => s.company.id));
    setServices(
      (p.services ?? []).length
        ? (p.services ?? []).map((s) => ({
            id: s.id, code: s.code, description: s.description, unit: s.unit || '',
            clientValue: String(s.clientValue ?? ''), subValue: String(s.subValue ?? ''),
          }))
        : [emptyService()],
    );
    setEditId(p.id); setError(''); setImportNote(''); setDraftStatus(''); setShowForm(true);
  }

  function toggleSub(id: string) {
    setSubIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateService(i: number, patch: Partial<ServiceRow>) {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addService() { setServices((prev) => [...prev, emptyService()]); }
  function removeService(i: number) {
    setServices((prev) => (prev.length <= 1 ? [emptyService()] : prev.filter((_, idx) => idx !== i)));
  }

  // Importa PDF de tabela de preços → mescla nas linhas por código, na coluna escolhida.
  async function onImportPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setImporting(true); setImportNote('Lendo o PDF…'); setError('');
    try {
      const fd = new FormData(); fd.append('file', f);
      const res = await api<{ lines: ParsedLine[]; note: string }>('/projects/parse-rate-table', {
        method: 'POST', body: fd, isForm: true,
      });
      setImportNote(res.note || '');
      mergeParsed(res.lines || [], importTarget);
    } catch (err) {
      setImportNote(''); setError(err instanceof ApiError ? err.message : 'Falha ao ler o PDF');
    } finally { setImporting(false); }
  }

  function mergeParsed(lines: ParsedLine[], target: Target) {
    if (!lines.length) return;
    setServices((prev) => {
      // remove a linha vazia inicial se ainda intocada
      const base = prev.filter((s) => s.code || s.description || s.clientValue || s.subValue);
      const byCode = new Map(base.map((s) => [s.code.trim().toLowerCase(), s]));
      const next = [...base];
      for (const ln of lines) {
        const key = ln.code.trim().toLowerCase();
        const val = String(ln.value ?? '');
        const existing = key ? byCode.get(key) : undefined;
        if (existing) {
          existing[target] = val;
          if (!existing.description && ln.description) existing.description = ln.description;
          if (!existing.unit && ln.unit) existing.unit = ln.unit;
        } else {
          const row: ServiceRow = {
            code: ln.code, description: ln.description, unit: ln.unit,
            clientValue: target === 'clientValue' ? val : '',
            subValue: target === 'subValue' ? val : '',
          };
          if (key) byCode.set(key, row);
          next.push(row);
        }
      }
      return next.length ? next : [emptyService()];
    });
  }

  async function save() {
    if (!code.trim()) { setError('Informe o código do projeto'); return; }
    if (!clientCompanyId) { setError('Selecione o contratante (cliente)'); return; }
    const cleaned = services
      .filter((s) => s.code.trim() || s.description.trim() || s.clientValue || s.subValue)
      .map((s) => ({
        code: s.code.trim(),
        description: s.description.trim(),
        unit: s.unit.trim() || undefined,
        clientValue: Number(s.clientValue || 0),
        subValue: Number(s.subValue || 0),
      }));
    if (cleaned.some((s) => !s.code)) { setError('Toda linha de serviço precisa de um código'); return; }
    setBusy(true); setError('');
    const body: Record<string, unknown> = {
      code: code.trim(),
      projectType,
      projectSource: projectSource.trim() || undefined,
      clientCompanyId,
      subcontractorCompanyIds: subIds,
      services: cleaned,
    };
    try {
      if (editId) await api(`/projects/${editId}`, { method: 'PATCH', body });
      else await api('/projects', { method: 'POST', body });
      clearDraft(); setDraftStatus('');
      setShowForm(false); load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar');
    } finally { setBusy(false); }
  }

  if (loading || !me) return <div className="center">Carregando…</div>;

  return (
    <>
      <Nav me={me} />
      <div className="container">
        <div className="row between">
          <h2 style={{ margin: '4px 0' }}>Projetos</h2>
          {canEdit && <button className="btn small" onClick={startCreate}>+ Novo</button>}
        </div>

        {showForm && canEdit && (
          <div className="card">
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{editId ? 'Editar projeto' : 'Novo projeto'}</h3>
              {!editId && draftStatus && (
                <span className="row" style={{ gap: 8 }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {draftStatus === 'recuperado' ? '↩ rascunho recuperado' : '✓ rascunho salvo'}
                  </span>
                  <button type="button" className="btn small secondary" style={{ width: 'auto', padding: '2px 8px' }} onClick={discardDraft}>Descartar</button>
                </span>
              )}
            </div>
            {error && <div className="error">{error}</div>}

            <div className="form-grid">
              <div>
                <label>Código do projeto</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex.: PRJ-001" />
              </div>
              <div>
                <label>Tipo de projeto</label>
                <select value={projectType} onChange={(e) => setProjectType(e.target.value as ProjectType)}>
                  <option value="SPLICE">Splice</option>
                  <option value="CONSTRUCTION">Construction</option>
                </select>
              </div>
              <div>
                <label>Origem do projeto</label>
                <input value={projectSource} onChange={(e) => setProjectSource(e.target.value)} placeholder="ex.: Spectrum, Dodd's" />
              </div>
              <div>
                <label>Contratante (cliente)</label>
                <select value={clientCompanyId} onChange={(e) => setClientCompanyId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <label>Subcontratadas (opcional)</label>
            {subs.length === 0 ? (
              <div className="muted">Nenhuma subcontratada cadastrada.</div>
            ) : (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {subs.map((c) => {
                  const on = subIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`btn small ${on ? '' : 'secondary'}`}
                      style={{ width: 'auto' }}
                      onClick={() => toggleSub(c.id)}
                    >
                      {on ? '✓ ' : ''}{c.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--line)', margin: '16px 0 4px' }} />
            <div className="row between" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: '8px 0' }}>Linhas de serviço</h3>
              <button type="button" className="btn small secondary" style={{ width: 'auto' }} onClick={addService}>+ Linha</button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Valor cheio = recebido do cliente. Valor de repasse = pago ao subcontratado.
            </p>

            {/* Importação por PDF */}
            <div className="card" style={{ background: 'var(--panel2)', padding: 12 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="muted">Importar tabela (PDF) para a coluna:</span>
                <select value={importTarget} onChange={(e) => setImportTarget(e.target.value as Target)} style={{ width: 'auto' }}>
                  <option value="clientValue">Valor cheio</option>
                  <option value="subValue">Valor de repasse</option>
                </select>
                <label className="btn small secondary" style={{ width: 'auto', cursor: 'pointer', margin: 0 }}>
                  {importing ? 'Lendo…' : '📎 Anexar PDF'}
                  <input type="file" accept="application/pdf" hidden disabled={importing} onChange={onImportPdf} />
                </label>
              </div>
              {importNote && <div className="muted" style={{ marginTop: 8 }}>{importNote}</div>}
            </div>

            {services.map((s, i) => (
              <div key={i} className="card" style={{ padding: 12, marginTop: 10 }}>
                <div className="row between" style={{ alignItems: 'center' }}>
                  <strong>Item {i + 1}</strong>
                  <button type="button" className="btn small danger" style={{ width: 'auto', padding: '2px 10px' }} onClick={() => removeService(i)}>Remover</button>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 90px' }}>
                    <label>Código</label>
                    <input value={s.code} onChange={(e) => updateService(i, { code: e.target.value })} placeholder="FS01" />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <label>Unidade</label>
                    <input value={s.unit} onChange={(e) => updateService(i, { unit: e.target.value })} placeholder="Per Splice / FT" />
                  </div>
                </div>
                <label>Descrição</label>
                <input value={s.description} onChange={(e) => updateService(i, { description: e.target.value })} />
                <div className="row" style={{ gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label>Valor cheio (cliente)</label>
                    <input type="number" inputMode="decimal" value={s.clientValue} onChange={(e) => updateService(i, { clientValue: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Valor de repasse (sub)</label>
                    <input type="number" inputMode="decimal" value={s.subValue} onChange={(e) => updateService(i, { subValue: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}

            <div className="stack actions" style={{ marginTop: 16 }}>
              <button className="btn" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
              <button className="btn secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {listError && <div className="error">{listError}</div>}

        {rows.length === 0 ? (
          <div className="center">{listError ? 'Não foi possível carregar.' : 'Nenhum projeto.'}</div>
        ) : (
          <div className="grid-cards">
          {rows.map((p) => {
          const subNames = (p.subcontractors ?? []).map((s) => s.company.name);
          return (
            <div className="card" key={p.id}>
              <div className="row between">
                <h3>{p.code}</h3>
                <span className="badge" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                  {p.projectType === 'CONSTRUCTION' ? 'Construction' : 'Splice'}
                </span>
              </div>
              <div className="muted">
                Contratante: {p.client?.name || '—'} · {(p.services ?? []).length} serviço(s)
              </div>
              {p.projectSource && <div className="muted" style={{ marginTop: 4 }}>Origem: {p.projectSource}</div>}
              <div className="muted" style={{ marginTop: 4 }}>
                Subcontratadas: {subNames.length ? subNames.join(', ') : '—'}
              </div>
              {canEdit && (
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn small secondary" onClick={() => startEdit(p)}>Editar</button>
                </div>
              )}
            </div>
          );
          })}
          </div>
        )}
      </div>
    </>
  );
}
