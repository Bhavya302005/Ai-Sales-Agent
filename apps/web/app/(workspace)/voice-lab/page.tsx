import { notFound } from "next/navigation";

import { diagnosticsEnabled } from "@/lib/runtime";

import { VoiceLab } from "./voice-lab";

export default function VoiceLabPage() {
  if (!diagnosticsEnabled()) notFound();
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">V01 feasibility gate</div>
          <h1 className="page-title">Bilingual voice round trip</h1>
        </div>
        <span className="mode-badge">Browser fallback · Sarvam optional</span>
      </header>
      <VoiceLab />
    </>
  );
}
