"use client";

import { useState, useEffect } from "react";

export function useCountdown(targetTimestamp: number): {
  remaining: number;
  isExpired: boolean;
  formatted: string;
} {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const target = targetTimestamp * 1000;
  const remaining = Math.max(0, target - now);
  const isExpired = remaining <= 0;

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const formatted = isExpired
    ? "Expired"
    : `${hours}h ${minutes}m ${seconds}s remaining`;

  return { remaining, isExpired, formatted };
}
