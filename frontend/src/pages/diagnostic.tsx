import React from 'react';
import { DiagnosticModal as DiagnosticComponent } from '@/components/DiagnosticModal';

export default function DiagnosticPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="max-w-4xl mx-auto px-6">
        <DiagnosticComponent inline />
      </div>
    </div>
  );
}
