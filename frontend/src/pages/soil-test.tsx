import React, { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SoilTestPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/soil-report');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
      <div className="text-center p-8">
        <div className="text-6xl mb-4">🔄</div>
        <div className="text-xl font-semibold text-neutral-900 mb-2">Redirecting to new Soil Report page...</div>
        <div className="text-sm text-neutral-600">Please wait</div>
      </div>
    </div>
  );
}
