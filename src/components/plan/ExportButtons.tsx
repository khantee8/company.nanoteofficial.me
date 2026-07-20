'use client';
export function ExportButtons({ planId, versionNo }: { planId: string; versionNo: number }) {
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <a href={`/api/plan/${planId}/export?fmt=pptx&v=${versionNo}`} style={{ padding: '6px 12px', border: '1px solid #2a3038', borderRadius: 6 }}>Export PPTX</a>
      <button onClick={() => window.print()} style={{ padding: '6px 12px', border: '1px solid #2a3038', borderRadius: 6, background: 'transparent', color: 'inherit' }}>Export PDF</button>
    </div>
  );
}
