import React from 'react';

const LoadingSpinner = ({ size = 'h-8 w-8' }: { size?: string }) => {
  return (
    <div className={`animate-spin rounded-full ${size} border-b-2 border-t-2 border-indigo-500`}></div>
  );
};

export default LoadingSpinner;
