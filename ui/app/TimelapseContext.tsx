import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Global Time-Lapse state
// ---------------------------------------------------------------------------
// Shared by every visualization that supports TL playback (nav-flow, funnel,
// Sankey, per-page breakdown, …). Individual visualizations compute their own
// bucket list from their own queries but subscribe to the same enabled/index/
// playing state so pressing ▶ Play animates them all in sync.

export type TlBucket = "1m" | "5m" | "10m" | "30m" | "1h";

export const TL_BUCKETS: { value: TlBucket; label: string }[] = [
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
  { value: "10m", label: "10 minutes" },
  { value: "30m", label: "30 minutes" },
  { value: "1h", label: "1 hour" },
];

export const TL_SPEEDS: { value: number; label: string }[] = [
  { value: 2000, label: "0.5x" },
  { value: 1200, label: "1x" },
  { value: 700, label: "2x" },
  { value: 400, label: "4x" },
];

export interface TimelapseState {
  enabled: boolean;
  bucket: TlBucket;
  speedMs: number;
  playing: boolean;
  index: number;
  totalBuckets: number;
  currentBucketKey: string;
  setEnabled: (v: boolean) => void;
  setBucket: (v: TlBucket) => void;
  setSpeedMs: (v: number) => void;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setIndex: React.Dispatch<React.SetStateAction<number>>;
  reportBuckets: (total: number, currentKey?: string) => void;
}

const TimelapseCtx = createContext<TimelapseState | null>(null);

export function useTimelapse(): TimelapseState {
  const v = useContext(TimelapseCtx);
  if (!v) throw new Error("useTimelapse must be used inside <TimelapseProvider>");
  return v;
}

export const TimelapseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enabled, setEnabled] = useState(false);
  const [bucket, setBucket] = useState<TlBucket>("1h");
  const [speedMs, setSpeedMs] = useState(1200);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [totalBuckets, setTotalBuckets] = useState(0);
  const [currentBucketKey, setCurrentBucketKey] = useState("");

  const totalRef = useRef(0);
  useEffect(() => { totalRef.current = totalBuckets; }, [totalBuckets]);

  // Reset play position whenever the bucket size or master switch changes.
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [bucket, enabled]);

  // Advance the play cursor while playing.
  useEffect(() => {
    if (!enabled || !playing) return;
    const id = window.setInterval(() => {
      setIndex(i => {
        const total = totalRef.current;
        if (total === 0) return i;
        const next = i + 1;
        if (next >= total) {
          setPlaying(false);
          return total - 1;
        }
        return next;
      });
    }, speedMs);
    return () => window.clearInterval(id);
  }, [enabled, playing, speedMs]);

  const reportBuckets = useCallback((total: number, key?: string) => {
    setTotalBuckets(total);
    if (key != null) setCurrentBucketKey(key);
  }, []);

  const value = useMemo<TimelapseState>(() => ({
    enabled, bucket, speedMs, playing, index, totalBuckets, currentBucketKey,
    setEnabled, setBucket, setSpeedMs, setPlaying, setIndex, reportBuckets,
  }), [enabled, bucket, speedMs, playing, index, totalBuckets, currentBucketKey, reportBuckets]);

  return <TimelapseCtx.Provider value={value}>{children}</TimelapseCtx.Provider>;
};
