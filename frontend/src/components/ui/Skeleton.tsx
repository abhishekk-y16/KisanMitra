interface SkeletonProps {
  variant?: 'text' | 'title' | 'avatar' | 'card' | 'button' | 'circle';
  width?: string;
  height?: string;
  className?: string;
}

interface SkeletonTextProps {
  lines?: number;
}

import mergeClasses from '../../lib/mergeClasses';

function SkeletonBase({
  variant = 'text',
  width,
  height,
  className = '',
}: SkeletonProps) {
  const baseStyles = `
    bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200
    bg-[length:200%_100%]
    animate-shimmer
  `;

  const variants = {
    text: 'h-4 rounded-md w-full',
    title: 'h-7 rounded-md w-3/4',
    avatar: 'w-12 h-12 rounded-full',
    card: 'h-32 rounded-2xl',
    button: 'h-12 rounded-xl w-32',
    circle: 'rounded-full aspect-square',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div
      className={mergeClasses(baseStyles, variants[variant], className)}
      style={style}
      role="status"
      aria-label="Loading..."
    />
  );
}

// Skeleton.Text - for multiple lines of text
function SkeletonText({ lines = 3 }: SkeletonTextProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBase 
          key={i} 
          variant="text" 
          width={i === lines - 1 ? '60%' : '100%'} 
        />
      ))}
    </div>
  );
}

// Skeleton.Card - preset for a card loading state
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-6 border border-neutral-100 shadow-md space-y-4">
      <div className="flex items-center gap-4">
        <SkeletonBase variant="avatar" />
        <div className="flex-1 space-y-2">
          <SkeletonBase variant="title" />
          <SkeletonBase variant="text" width="60%" />
        </div>
      </div>
      <div className="space-y-2">
        <SkeletonBase variant="text" />
        <SkeletonBase variant="text" />
        <SkeletonBase variant="text" width="80%" />
      </div>
    </div>
  );
}

// Skeleton.FeatureCard - preset for feature cards
function SkeletonFeatureCard() {
  return (
    <div className="bg-white rounded-2xl p-6 border border-neutral-100 shadow-md flex flex-col items-center justify-center min-h-[140px]">
      <SkeletonBase variant="circle" width="48px" height="48px" className="mb-3" />
      <SkeletonBase variant="text" width="80px" className="mb-1" />
      <SkeletonBase variant="text" width="60px" height="12px" />
    </div>
  );
}

// Skeleton.PriceList - preset for price lists
function SkeletonPriceList() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex justify-between items-center py-2">
          <SkeletonBase variant="text" width="120px" />
          <SkeletonBase variant="text" width="80px" />
        </div>
      ))}
    </div>
  );
}

// Compound component pattern
export const Skeleton = Object.assign(SkeletonBase, {
  Text: SkeletonText,
  Card: SkeletonCard,
  FeatureCard: SkeletonFeatureCard,
  PriceList: SkeletonPriceList,
});
