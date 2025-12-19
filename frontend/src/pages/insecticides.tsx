import React from 'react';
import { useRouter } from 'next/router';

export default function InsecticidesPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="max-w-4xl mx-auto px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold mb-2">Insecticides</h1>
        <p className="text-sm text-neutral-500 mb-6">कीट नाशक — product lists and application guidance.</p>

        <div className="bg-white p-6 rounded-xl shadow-sm">
          <p className="text-neutral-600">Placeholder for insecticide catalogs, safety and scheduling tools.</p>
        </div>

        <div className="mt-6">
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-primary-600 text-white rounded-md">Back</button>
        </div>
      </main>
    </div>
  );
}
