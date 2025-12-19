interface ConfidenceMeterProps {
  value?: number; // 0-1
  confidence?: number; // alias for value
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ConfidenceMeter({
  value,
  confidence,
  showLabel = true,
  size = 'md',
}: ConfidenceMeterProps) {
  const actualValue = value ?? confidence ?? 0;
  const percentage = Math.round(actualValue * 100);
  
  const getLevel = () => {
    if (percentage >= 80) return { level: 'high', label: 'High Confidence', color: 'from-emerald-500 to-emerald-400' };
    if (percentage >= 50) return { level: 'medium', label: 'Medium Confidence', color: 'from-amber-500 to-amber-400' };
    return { level: 'low', label: 'Low Confidence', color: 'from-red-500 to-red-400' };
  };

  const { level, label, color } = getLevel();

  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-neutral-600">{label}</span>
          <span className={`text-sm font-bold ${
            level === 'high' ? 'text-emerald-600' :
            level === 'medium' ? 'text-amber-600' : 'text-red-600'
          }`}>
            {percentage}%
          </span>
        </div>
      )}
      <div className={`relative ${heights[size]} bg-neutral-100 rounded-full overflow-hidden`}>
        <div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${color} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
