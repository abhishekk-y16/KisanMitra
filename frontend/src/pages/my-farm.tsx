import React from 'react';
import { useRouter } from 'next/router';

export default function MyFarmPage() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="max-w-4xl mx-auto px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold mb-2">My Farm</h1>
        <p className="text-sm text-neutral-500 mb-6">मेरा खेत — overview of your farm, tractors, assets and plots.</p>

        <div className="bg-white p-6 rounded-xl shadow-sm">
          <p className="text-neutral-600">Placeholder for farm-level settings and summaries (employees, equipment, irrigation schedules).</p>
        </div>

        <div className="mt-6">
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-primary-600 text-white rounded-md">Back</button>
        </div>
      </main>
    </div>
  );
}
