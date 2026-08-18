'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PDFDocument, rgb } from 'pdf-lib';
import { api, API_BASE } from '@/lib/api';
import { getAccess } from '@/lib/auth';

type Tool = 'pen' | 'line' | 'text';
interface Pt { x: number; y: number }
interface Stroke { tool: Tool; color: string; width: number; points: Pt[]; text?: string; size?: number }
interface PageInfo { scale: number }

const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#000000'];

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function RedlineInner() {
  const router = useRouter();
  const params = useSearchParams();
  const daily = params.get('daily') || '';
  const att = params.get('att') || '';

  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pdfDocRef = useRef<any>(null);
  const bytesRef = useRef<ArrayBuffer | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Record<number, Stroke[]>>({});
  const pageInfoRef = useRef<Record<number, PageInfo>>({});
  const drawingRef = useRef<{ active: boolean; stroke: Stroke | null }>({ active: false, stroke: null });

  // Carrega o PDF original (autenticado) e o pdf.js.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!daily || !att) { setError('RedLine não informado'); setLoading(false); return; }
        const res = await fetch(`${API_BASE}/api/v1/daily-production/${daily}/attachments/${att}/original`, {
          headers: { Authorization: `Bearer ${getAccess()}` },
        });
        if (!res.ok) throw new Error('Falha ao carregar o PDF');
        const buf = await res.arrayBuffer();
        bytesRef.current = buf.slice(0); // cópia p/ o pdf-lib (pdf.js pode neutralizar o buffer)
        const pdfjs: any = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'Não consegui abrir o PDF'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [daily, att]);

  const redrawOverlay = useCallback(() => {
    const ov = overlayRef.current; if (!ov) return;
    const ctx = ov.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, ov.width, ov.height);
    for (const st of strokesRef.current[pageIndex] || []) {
      ctx.strokeStyle = st.color; ctx.fillStyle = st.color;
      ctx.lineWidth = st.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (st.tool === 'text') {
        ctx.font = `${st.size || 18}px sans-serif`;
        ctx.fillText(st.text || '', st.points[0].x, st.points[0].y);
      } else if (st.points.length) {
        ctx.beginPath();
        ctx.moveTo(st.points[0].x, st.points[0].y);
        for (let i = 1; i < st.points.length; i++) ctx.lineTo(st.points[i].x, st.points[i].y);
        ctx.stroke();
      }
    }
  }, [pageIndex]);

  // Renderiza a página atual no canvas do PDF + prepara o overlay.
  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current; if (!doc) return;
    const page = await doc.getPage(pageIndex + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const maxW = Math.min(typeof window !== 'undefined' ? window.innerWidth - 16 : 900, 1000);
    const scale = Math.max(0.5, Math.min(2, maxW / vp1.width));
    const vp = page.getViewport({ scale });
    pageInfoRef.current[pageIndex] = { scale };
    const c = pdfCanvasRef.current, ov = overlayRef.current;
    if (!c || !ov) return;
    c.width = ov.width = Math.floor(vp.width);
    c.height = ov.height = Math.floor(vp.height);
    const ctx = c.getContext('2d'); if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    redrawOverlay();
  }, [pageIndex, redrawOverlay]);

  useEffect(() => { if (!loading && pdfDocRef.current) void renderPage(); }, [loading, pageIndex, renderPage]);

  function pos(e: React.PointerEvent): Pt {
    const ov = overlayRef.current!;
    const r = ov.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (ov.width / r.width), y: (e.clientY - r.top) * (ov.height / r.height) };
  }

  function onDown(e: React.PointerEvent) {
    if (saving) return;
    const p = pos(e);
    if (tool === 'text') {
      const text = window.prompt('Texto da marcação:') || '';
      if (!text) return;
      (strokesRef.current[pageIndex] ||= []).push({ tool: 'text', color, width: 2, points: [p], text, size: 18 });
      redrawOverlay();
      return;
    }
    drawingRef.current = { active: true, stroke: { tool, color, width: tool === 'pen' ? 3 : 3, points: [p] } };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = drawingRef.current; if (!d.active || !d.stroke) return;
    const p = pos(e);
    if (d.stroke.tool === 'pen') d.stroke.points.push(p);
    else d.stroke.points = [d.stroke.points[0], p]; // linha reta: start + atual
    const ov = overlayRef.current!; const ctx = ov.getContext('2d')!;
    redrawOverlay();
    ctx.strokeStyle = d.stroke.color; ctx.lineWidth = d.stroke.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(d.stroke.points[0].x, d.stroke.points[0].y);
    for (let i = 1; i < d.stroke.points.length; i++) ctx.lineTo(d.stroke.points[i].x, d.stroke.points[i].y);
    ctx.stroke();
  }
  function onUp() {
    const d = drawingRef.current;
    if (d.active && d.stroke && d.stroke.points.length) (strokesRef.current[pageIndex] ||= []).push(d.stroke);
    drawingRef.current = { active: false, stroke: null };
    redrawOverlay();
  }

  function undo() {
    const arr = strokesRef.current[pageIndex]; if (arr && arr.length) { arr.pop(); redrawOverlay(); }
  }
  function clearPage() {
    if (!window.confirm('Limpar as marcações desta página?')) return;
    strokesRef.current[pageIndex] = []; redrawOverlay();
  }

  async function save() {
    if (!bytesRef.current) return;
    setSaving(true); setError('');
    try {
      const pdfDoc = await PDFDocument.load(bytesRef.current);
      const pages = pdfDoc.getPages();
      for (const [idxStr, strokes] of Object.entries(strokesRef.current)) {
        const idx = Number(idxStr);
        const page = pages[idx]; const info = pageInfoRef.current[idx];
        if (!page || !info || !strokes.length) continue;
        const h = page.getHeight(); const s = info.scale;
        for (const st of strokes) {
          const col = hexToRgb(st.color);
          if (st.tool === 'text') {
            page.drawText(st.text || '', { x: st.points[0].x / s, y: h - st.points[0].y / s, size: (st.size || 18) / s, color: col });
          } else {
            for (let i = 1; i < st.points.length; i++) {
              page.drawLine({
                start: { x: st.points[i - 1].x / s, y: h - st.points[i - 1].y / s },
                end: { x: st.points[i].x / s, y: h - st.points[i].y / s },
                thickness: st.width / s, color: col,
              });
            }
          }
        }
      }
      const out = await pdfDoc.save();
      const blob = new Blob([out as unknown as BlobPart], { type: 'application/pdf' });
      const form = new FormData();
      form.append('file', blob, 'redline.pdf');
      form.append('type', 'REDLINE');
      await api(`/daily-production/${daily}/attachments`, { method: 'POST', body: form, isForm: true });
      // substitui: remove o RedLine anterior
      await api(`/daily-production/${daily}/attachments/${att}`, { method: 'DELETE' });
      router.replace(`/dailies/detail?id=${daily}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar as marcações');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <h1>Marcar RedLine</h1>
        <Link href={`/dailies/detail?id=${daily}`} className="btn small secondary">Voltar</Link>
      </div>
      <div className="container">
        {error && <div className="error">{error}</div>}
        {loading ? <div className="center">Carregando PDF…</div> : (
          <>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <button className={`btn small ${tool === 'pen' ? '' : 'secondary'}`} style={{ width: 'auto' }} onClick={() => setTool('pen')}>✏️ Caneta</button>
              <button className={`btn small ${tool === 'line' ? '' : 'secondary'}`} style={{ width: 'auto' }} onClick={() => setTool('line')}>／ Linha</button>
              <button className={`btn small ${tool === 'text' ? '' : 'secondary'}`} style={{ width: 'auto' }} onClick={() => setTool('text')}>T Texto</button>
              <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} title={c}
                  style={{ width: 26, height: 26, borderRadius: 6, background: c, border: color === c ? '3px solid #fff' : '1px solid rgba(255,255,255,.3)', boxShadow: color === c ? '0 0 0 2px #000' : 'none', cursor: 'pointer' }} />
              ))}
              <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
              <button className="btn small secondary" style={{ width: 'auto' }} onClick={undo}>↶ Desfazer</button>
              <button className="btn small secondary" style={{ width: 'auto' }} onClick={clearPage}>Limpar</button>
            </div>

            {numPages > 1 && (
              <div className="row between" style={{ marginBottom: 8, alignItems: 'center' }}>
                <button className="btn small secondary" style={{ width: 'auto' }} disabled={pageIndex === 0} onClick={() => setPageIndex((i) => Math.max(0, i - 1))}>← Anterior</button>
                <span className="muted">Página {pageIndex + 1} de {numPages}</span>
                <button className="btn small secondary" style={{ width: 'auto' }} disabled={pageIndex >= numPages - 1} onClick={() => setPageIndex((i) => Math.min(numPages - 1, i + 1))}>Próxima →</button>
              </div>
            )}

            <div style={{ position: 'relative', overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, background: '#fff', touchAction: 'none' }}>
              <canvas ref={pdfCanvasRef} style={{ display: 'block' }} />
              <canvas
                ref={overlayRef}
                style={{ position: 'absolute', left: 0, top: 0, touchAction: 'none', cursor: 'crosshair' }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
              />
            </div>

            <div className="stack" style={{ marginTop: 16 }}>
              <button className="btn ok" disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar marcações (substitui o RedLine)'}</button>
              <Link href={`/dailies/detail?id=${daily}`} className="btn secondary">Cancelar</Link>
            </div>
            <p className="muted center" style={{ marginTop: 12, fontSize: 12 }}>As marcações são gravadas dentro do PDF. O arquivo original é substituído pela versão marcada.</p>
          </>
        )}
      </div>
    </>
  );
}

export default function RedlineEditorPage() {
  return (
    <Suspense fallback={<div className="center">Carregando…</div>}>
      <RedlineInner />
    </Suspense>
  );
}
