import React from 'react';
import { WeatherModal as WeatherComponent } from '@/components/WeatherModal';

export default function WeatherPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="max-w-4xl mx-auto px-6">
        <WeatherComponent inline />
      </div>
    </div>
  );
}
